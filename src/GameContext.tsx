import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { collideDrone, createDroneState, stepDrone, type Aabb, type DroneInput, type DroneState, type Vec3 } from './core/drone'
import { beamProfile, beginCarDestruction, isInsideBeam, stepBeamObjects, type BeamField, type BeamObject } from './core/beam'
import { beginNearbyCrowdAbsorption, createCrowdState, stepCrowds, type CrowdState } from './core/crowds'
import { activeEnemyCount, createEnemyState, hitEnemy, nearbyEnemyContacts, stepEnemies, stepEnemyProjectiles, syncAntiAirEnemies, syncEnemyTiers, waveLabelForTime, waveStageForTime, type EnemyState } from './core/enemies'
import {
  createLaserPool,
  createLaserBurstPool,
  directionToLaserAim,
  fireLaserBeam,
  laserDirection,
  laserRisingEdge,
  resolveLaserAim,
  stepLaserProjectiles,
  stepLaserBursts,
  triggerLaserBurst,
  type LaserBurst,
  type LaserProjectile,
  type LaserSphereTarget,
} from './core/laser'
import { requestedPilotExpression, updatePilotExpression, type PilotExpression } from './core/pilot'
import { activeWorldColliders, createActiveWorld, updateActiveWorld, WORLD_MAX_CARS, WORLD_REMOVE_RADIUS, type ActiveWorld, type ProceduralCar } from './core/world'
import { captureTrafficCar, createTrafficState, releaseTrafficSlot, stepTraffic, TRAFFIC_MAX_CARS, type TrafficCar, type TrafficState } from './core/traffic'
import { setBgmWave, startBgm, stopBgm, tone } from './audio'

export type GamePhase = 'intro' | 'playing' | 'results'

export const SURVIVAL_START_TIME = 45
export const SURVIVAL_TARGET_TIME = 180
export const MAX_CARRIED_CARS = 6

export type GameRuntime = {
  drone: DroneState
  world: ActiveWorld
  worldColliders: Aabb[]
  sessionTime: number
  remainingTime: number
  score: number
  waveStage: number
  loadedCars: number
  damageCooldown: number
  collisionCooldown: number
  turbo: number
  aimX: number
  aimY: number
  laserAimOrigin: Vec3
  laserAimDirection: Vec3
  beamActive: boolean
  beamTargetId: string | null
  laserActive: boolean
  laserInputHeld: boolean
  dropInputHeld: boolean
  laserFlash: number
  laserCooldown: number
  laserShotsFired: number
  laserProjectiles: LaserProjectile[]
  laserBursts: LaserBurst[]
  laserTargets: LaserSphereTarget[]
  enemies: EnemyState
  enemiesDown: number
  beamObjects: BeamObject[]
  crowds: CrowdState
  traffic: TrafficState
  destroyedCars: Set<string>
  crowdThreats: Vec3[]
  phase: GamePhase
  message: string
  messageTime: number
  impactFlash: number
  pickupPulse: number
  timeBonusPulse: number
  timeBonusAmount: number
  resultTitle: string
  victory: boolean
  pilotExpression: PilotExpression
  pilotHoldUntil: number
  pilotPreviousCars: number
  pilotPreviousThreat: number
}

export type GameSnapshot = {
  phase: GamePhase
  speed: number
  height: number
  position: Vec3
  survivalTime: number
  remainingTime: number
  survivalTarget: number
  score: number
  waveStage: number
  loadedCars: number
  maxLoadedCars: number
  cargoSlowdown: number
  turbo: number
  boostActive: boolean
  aimX: number
  aimY: number
  beamActive: boolean
  beamAvailable: boolean
  beamTargetId: string | null
  laserActive: boolean
  laserFlash: number
  activeEnemies: number
  enemiesDown: number
  beamObjectCount: number
  message: string
  impactFlash: number
  pickupPulse: number
  timeBonusPulse: number
  timeBonusAmount: number
  resultTitle: string
  victory: boolean
  pilotExpression: PilotExpression
}

export type PlayerInput = DroneInput & { beam: boolean; laser: boolean; drop: boolean }
type MobileInput = PlayerInput & { active: boolean }
type GameContextValue = {
  runtime: React.MutableRefObject<GameRuntime>
  snapshot: GameSnapshot
  readInput: () => PlayerInput
  advance: (dt: number) => void
  start: () => void
  restart: () => void
  setMobileInput: (input: Partial<MobileInput>) => void
}

const GameContext = createContext<GameContextValue | null>(null)
const UFO_UPGRADES = { speed: 0.45, stability: 0, rack: 0, special: 'none' as const }

function makeBeamObject(car: ProceduralCar): BeamObject {
  return {
    id: car.id,
    kind: 'car',
    mass: 2.4,
    color: car.color,
    position: { ...car.position },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: car.rotation, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    active: true,
    inBeam: false,
    tether: 0,
    playerTouched: false,
    destroying: false,
    destroyTimer: 0,
    explosionPending: false,
    absorbing: false,
    absorbTimer: 0,
  }
}

function makeTrafficBeamObject(car: TrafficCar): BeamObject {
  return {
    ...makeBeamObject({ id: car.id, cellX: 0, cellZ: 0, position: car.position, rotation: car.rotation, color: car.color }),
    velocity: { x: car.axis === 'x' ? car.speed * car.direction : 0, y: 0, z: car.axis === 'z' ? car.speed * car.direction : 0 },
    inBeam: true,
    playerTouched: true,
  }
}

function makeRuntime(): GameRuntime {
  const drone = createDroneState()
  drone.position = { x: 0, y: 2.8, z: 54.5 }
  drone.heading = Math.PI
  const world = createActiveWorld(drone.position)
  const crowds = createCrowdState((Math.random() * 0xffffffff) >>> 0)
  stepCrowds(crowds, { position: drone.position, heading: drone.heading, colliders: activeWorldColliders(world) }, 0)
  const traffic = createTrafficState((Math.random() * 0xffffffff) >>> 0)
  const enemies = createEnemyState()
  const crowdThreats = [{ ...drone.position }, ...traffic.cars.map((car) => ({ ...car.position })), ...enemies.slots.map((enemy) => ({ ...enemy.position })), ...crowds.objects.map((object) => ({ ...object.position }))]
  return {
    drone,
    world,
    worldColliders: activeWorldColliders(world),
    sessionTime: 0,
    remainingTime: SURVIVAL_START_TIME,
    score: 0,
    waveStage: 0,
    loadedCars: 0,
    damageCooldown: 0,
    collisionCooldown: 0,
    turbo: 1,
    aimX: 0,
    aimY: 0,
    laserAimOrigin: { ...drone.position },
    laserAimDirection: laserDirection(drone.heading, drone.pitch),
    beamActive: false,
    beamTargetId: null,
    laserActive: false,
    laserInputHeld: false,
    dropInputHeld: false,
    laserFlash: 0,
    laserCooldown: 0,
    laserShotsFired: 0,
    laserProjectiles: createLaserPool(),
    laserBursts: createLaserBurstPool(),
    laserTargets: [],
    enemies,
    enemiesDown: 0,
    beamObjects: world.cars.map(makeBeamObject),
    crowds,
    traffic,
    destroyedCars: new Set<string>(),
    crowdThreats,
    phase: 'intro',
    message: 'ABSORB PEOPLE · KEEP THE CLOCK ALIVE',
    messageTime: 4,
    impactFlash: 0,
    pickupPulse: 0,
    timeBonusPulse: 0,
    timeBonusAmount: 0,
    resultTitle: '',
    victory: false,
    pilotExpression: 'normal',
    pilotHoldUntil: 0,
    pilotPreviousCars: 0,
    pilotPreviousThreat: 0,
  }
}

function syncBeamObjects(game: GameRuntime) {
  const existing = new Map(game.beamObjects.map((object) => [object.id, object]))
  const retained = game.beamObjects.filter((object) => object.active && (object.inBeam || object.tether > 0.02 || object.playerTouched) && Math.hypot(object.position.x - game.drone.position.x, object.position.z - game.drone.position.z) <= WORLD_REMOVE_RADIUS)
  const retainedIds = new Set(retained.map((object) => object.id))
  const nearby = game.world.cars.filter((car) => !retainedIds.has(car.id) && !game.destroyedCars.has(car.id)).map((car) => existing.get(car.id) ?? makeBeamObject(car))
  const capturedTraffic = retained.filter((object) => object.id.startsWith('traffic:'))
  const parked = [...retained.filter((object) => !object.id.startsWith('traffic:')), ...nearby].slice(0, WORLD_MAX_CARS)
  game.beamObjects = [...capturedTraffic.slice(0, TRAFFIC_MAX_CARS), ...parked]
  const retainedTrafficIds = new Set(capturedTraffic.map((object) => object.id))
  for (const car of game.traffic.cars) if (car.captured && !retainedTrafficIds.has(car.id)) releaseTrafficSlot(game.traffic, car.id)
}

function writeLaserSphereTarget(targets: LaserSphereTarget[], slot: number, id: string, center: Vec3, radius: number) {
  const target = targets[slot] ?? { id, kind: 'fighter' as const, center: { x: 0, y: 0, z: 0 }, radius }
  target.id = id
  target.kind = id.startsWith('car:') || id.startsWith('traffic:') ? 'car' : 'fighter'
  target.center.x = center.x
  target.center.y = center.y
  target.center.z = center.z
  target.radius = radius
  targets[slot] = target
  return slot + 1
}

function laserSphereTargets(game: GameRuntime) {
  let slot = 0
  for (const enemy of game.enemies.slots) if (enemy.active) slot = writeLaserSphereTarget(game.laserTargets, slot, enemy.id, enemy.position, enemy.kind === 'boss' ? 7 : enemy.hitRadius)
  for (const object of game.beamObjects) if (object.active && !object.destroying) slot = writeLaserSphereTarget(game.laserTargets, slot, object.id, object.position, 1.7)
  for (const car of game.traffic.cars) if (car.active) slot = writeLaserSphereTarget(game.laserTargets, slot, car.id, car.position, 1.7)
  game.laserTargets.length = slot
  return game.laserTargets
}

function loadedCarCount(game: GameRuntime) {
  let count = 0
  for (const object of game.beamObjects) if (object.active && (object.inBeam || object.tether > 0.02)) count += 1
  return Math.min(MAX_CARRIED_CARS, count)
}

function limitLoadedCars(game: GameRuntime) {
  let count = 0
  for (const object of game.beamObjects) {
    if (!object.active || (!object.inBeam && object.tether <= 0.02)) continue
    count += 1
    if (count <= MAX_CARRIED_CARS) continue
    object.inBeam = false
    object.tether = 0
    object.velocity.y = Math.max(1.5, object.velocity.y)
  }
}

function dropCars(game: GameRuntime) {
  let dropped = 0
  for (const object of game.beamObjects) {
    if (!object.active || (!object.inBeam && object.tether <= 0.02)) continue
    object.inBeam = false
    object.tether = 0
    object.velocity.x += game.drone.velocity.x * 0.18
    object.velocity.z += game.drone.velocity.z * 0.18
    object.velocity.y = Math.max(2, object.velocity.y)
    dropped += 1
  }
  game.loadedCars = 0
  if (dropped > 0) {
    game.message = `CARGO RELEASED · ${dropped} CARS`
    game.messageTime = 1.1
    tone('upgrade')
  }
}

function registerEnemyLaserHit(game: GameRuntime, id: string) {
  const result = hitEnemy(game.enemies, id)
  if (!result.destroyed || !result.kind) return
  const reward = result.kind === 'boss' ? 1200 : result.kind === 'tank' ? 260 : result.kind === 'anti-air' ? 180 : result.kind === 'fighter' ? 140 : result.kind === 'helicopter' ? 80 : result.kind === 'police-car' ? 55 : 35
  game.enemiesDown += 1
  game.score += reward
  game.message = `${result.kind.toUpperCase()} POPPED · +${reward}`
  game.messageTime = 1.4
  tone('upgrade')
}

function destroyCar(game: GameRuntime, id: string, direction: Vec3) {
  let target: BeamObject | null = null
  for (const object of game.beamObjects) if (object.id === id && object.active) { target = object; break }
  if (!target) {
    const captured = captureTrafficCar(game.traffic, id)
    if (captured) { target = makeTrafficBeamObject(captured); game.beamObjects.unshift(target) }
  }
  if (!target || !beginCarDestruction(target, direction, game.drone.velocity)) return false
  game.destroyedCars.add(id)
  game.score += 50
  return true
}

function absorbCrowd(game: GameRuntime, kind: 'cat' | 'pedestrian') {
  const seconds = kind === 'cat' ? 12 : 4
  const reward = kind === 'cat' ? 40 : 15
  game.remainingTime += seconds
  game.score += reward
  game.timeBonusAmount = seconds
  game.timeBonusPulse = 1
  game.pickupPulse = 1
  game.message = `${kind === 'cat' ? 'CAT' : 'PERSON'} ABSORBED · +${seconds}s · +${reward}`
  game.messageTime = 1.25
  tone('pickup')
}

function syncCrowdThreats(game: GameRuntime) {
  const far = 100000
  const droneThreat = game.crowdThreats[0]!
  droneThreat.x = game.drone.position.x
  droneThreat.y = game.drone.position.y
  droneThreat.z = game.drone.position.z
  let index = 1
  for (const car of game.traffic.cars) {
    const threat = game.crowdThreats[index++]!
    threat.x = car.active ? car.position.x : far
    threat.y = car.active ? car.position.y : far
    threat.z = car.active ? car.position.z : far
  }
  for (const enemy of game.enemies.slots) {
    const threat = game.crowdThreats[index++]!
    threat.x = enemy.active ? enemy.position.x : far
    threat.y = enemy.active ? enemy.position.y : far
    threat.z = enemy.active ? enemy.position.z : far
  }
  for (const object of game.crowds.objects) {
    const threat = game.crowdThreats[index++]!
    threat.x = object.active ? object.position.x : far
    threat.y = object.active ? object.position.y : far
    threat.z = object.active ? object.position.z : far
  }
}

function registerImpact(game: GameRuntime, source: 'ENEMY' | 'BUILDING', customDamage?: number) {
  if (game.damageCooldown > 0 || game.phase !== 'playing') return
  game.damageCooldown = 1.05
  game.impactFlash = 1
  const damage = customDamage ?? (source === 'BUILDING' ? 4 : 8)
  game.remainingTime = Math.max(0, game.remainingTime - damage)
  game.message = `${source} IMPACT · TIME -${damage}s`
  game.messageTime = 1.8
  tone(source === 'BUILDING' ? 'impact' : 'warning')
  if ('vibrate' in navigator) navigator.vibrate?.([35, 20, 35])
}

function snapshotOf(game: GameRuntime): GameSnapshot {
  const slowdown = Math.max(0, 1 - (game.loadedCars > 0 ? 1 / (1 + game.loadedCars * 0.13) : 1))
  return {
    phase: game.phase,
    speed: Math.hypot(game.drone.velocity.x, game.drone.velocity.y, game.drone.velocity.z),
    height: game.drone.position.y,
    position: { ...game.drone.position },
    survivalTime: game.sessionTime,
    remainingTime: game.remainingTime,
    survivalTarget: SURVIVAL_TARGET_TIME,
    score: game.score,
    waveStage: game.waveStage,
    loadedCars: game.loadedCars,
    maxLoadedCars: MAX_CARRIED_CARS,
    cargoSlowdown: slowdown,
    turbo: game.turbo,
    boostActive: game.drone.boostRemaining > 0,
    aimX: game.aimX,
    aimY: game.aimY,
    beamActive: game.beamActive,
    beamAvailable: true,
    beamTargetId: game.beamTargetId,
    laserActive: game.laserActive,
    laserFlash: game.laserFlash,
    activeEnemies: activeEnemyCount(game.enemies),
    enemiesDown: game.enemiesDown,
    beamObjectCount: game.loadedCars,
    message: game.messageTime > 0 ? game.message : '',
    impactFlash: game.impactFlash,
    pickupPulse: game.pickupPulse,
    timeBonusPulse: game.timeBonusPulse,
    timeBonusAmount: game.timeBonusAmount,
    resultTitle: game.resultTitle,
    victory: game.victory,
    pilotExpression: game.pilotExpression,
  }
}

function updatePilotStatus(game: GameRuntime) {
  const next = requestedPilotExpression({
    elapsed: game.sessionTime,
    impact: game.impactFlash > 0,
    threatLevel: game.waveStage,
    threatIncreased: game.waveStage > game.pilotPreviousThreat,
    cargoIncreased: game.loadedCars > game.pilotPreviousCars,
    phase: game.phase,
    victory: game.victory,
    boost: game.drone.boostRemaining > 0,
    beam: game.beamActive,
    laser: game.laserActive,
  })
  const state = updatePilotExpression({ expression: game.pilotExpression, holdUntil: game.pilotHoldUntil }, next, game.sessionTime)
  game.pilotExpression = state.expression
  game.pilotHoldUntil = state.holdUntil
  game.pilotPreviousCars = game.loadedCars
  game.pilotPreviousThreat = game.waveStage
}

function endRun(game: GameRuntime, title: string, victory: boolean) {
  stopBgm()
  game.phase = 'results'
  game.resultTitle = title
  game.victory = victory
  game.beamActive = false
  game.laserActive = false
  game.message = title
  game.messageTime = 10
}

export function GameProvider({ children }: { children: ReactNode }) {
  const runtime = useRef(makeRuntime())
  const [snapshot, setSnapshot] = useState(() => snapshotOf(runtime.current))
  const keys = useRef<Record<string, boolean>>({})
  const pointer = useRef({ x: 0, y: 0 })
  const mobile = useRef<MobileInput>({ throttle: 0, steer: 0, strafe: 0, lookPitch: 0, vertical: 0, special: false, beam: false, laser: false, drop: false, active: false })
  const publishAccumulator = useRef(0)
  const publish = useCallback(() => setSnapshot(snapshotOf(runtime.current)), [])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keys.current[event.code] = true
      if (event.key.length === 1) keys.current[`Key${event.key.toUpperCase()}`] = true
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault()
    }
    const up = (event: KeyboardEvent) => {
      keys.current[event.code] = false
      if (event.key.length === 1) keys.current[`Key${event.key.toUpperCase()}`] = false
    }
    const move = (event: PointerEvent) => {
      const canvas = document.querySelector<HTMLCanvasElement>('.game-shell canvas')
      const bounds = canvas?.getBoundingClientRect()
      if (!bounds) return
      pointer.current.x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1))
      pointer.current.y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1))
    }
    const leave = () => { pointer.current.x = 0; pointer.current.y = 0 }
    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerdown', move)
    document.documentElement.addEventListener('mouseleave', leave)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', move)
      document.documentElement.removeEventListener('mouseleave', leave)
      stopBgm()
    }
  }, [])

  const readInput = useCallback((): PlayerInput => {
    const pointerMagnitude = Math.abs(pointer.current.x)
    const mouseSteer = pointerMagnitude < 0.08 ? 0 : -Math.sign(pointer.current.x) * Math.pow((pointerMagnitude - 0.08) / 0.92, 1.18)
    const keyboard: PlayerInput = {
      throttle: (keys.current.KeyW || keys.current.ArrowUp ? 1 : 0) - (keys.current.KeyS || keys.current.ArrowDown ? 1 : 0),
      steer: mouseSteer,
      strafe: (keys.current.KeyA || keys.current.ArrowLeft ? 1 : 0) - (keys.current.KeyD || keys.current.ArrowRight ? 1 : 0),
      lookPitch: -pointer.current.y,
      vertical: 0,
      special: Boolean(keys.current.Space),
      beam: Boolean(keys.current.KeyE),
      laser: Boolean(keys.current.KeyQ),
      drop: Boolean(keys.current.KeyR),
    }
    if (!mobile.current.active) return keyboard
    const { active: _active, ...mobileInput } = mobile.current
    return { ...keyboard, ...mobileInput }
  }, [])

  const advance = useCallback((dt: number) => {
    const game = runtime.current
    if (game.phase !== 'playing') return
    const d = Math.min(dt, 0.05)
    const input = readInput()
    game.aimX = pointer.current.x
    game.aimY = pointer.current.y
    game.sessionTime += d
    game.remainingTime = Math.max(0, game.remainingTime - d)
    game.messageTime = Math.max(0, game.messageTime - d)
    game.impactFlash = Math.max(0, game.impactFlash - d * 5)
    game.pickupPulse = Math.max(0, game.pickupPulse - d * 3.2)
    game.timeBonusPulse = Math.max(0, game.timeBonusPulse - d * 2.6)
    game.damageCooldown = Math.max(0, game.damageCooldown - d)
    game.collisionCooldown = Math.max(0, game.collisionCooldown - d)
    game.laserCooldown = Math.max(0, game.laserCooldown - d)
    game.laserFlash = Math.max(0, game.laserFlash - d)
    stepLaserBursts(game.laserBursts, d)
    stepLaserProjectiles(game.laserProjectiles, d)
    if (game.remainingTime <= 0) {
      endRun(game, 'TIME DEPLETED', false)
      updatePilotStatus(game)
      publish()
      return
    }
    if (game.sessionTime >= SURVIVAL_TARGET_TIME) {
      endRun(game, 'SURVIVAL COMPLETE', true)
      updatePilotStatus(game)
      publish()
      return
    }

    const dropPressed = input.drop && !game.dropInputHeld
    game.dropInputHeld = input.drop
    if (dropPressed) dropCars(game)
    const turboActive = input.special && game.turbo > 0.02
    if (turboActive) {
      if (game.drone.boostRemaining <= 0) { game.message = 'TURBO ENGAGED'; game.messageTime = 1.2; tone('upgrade') }
      game.turbo = Math.max(0, game.turbo - d * 0.31)
      game.drone.boostRemaining = Math.max(game.drone.boostRemaining, 0.12)
    } else game.turbo = Math.min(1, game.turbo + d * 0.13)

    game.loadedCars = loadedCarCount(game)
    const flightInput: DroneInput = { ...input, special: false }
    const stepped = stepDrone(game.drone, flightInput, d, game.loadedCars, UFO_UPGRADES)
    const nextWorld = updateActiveWorld(game.world, stepped.position)
    if (nextWorld !== game.world) {
      game.world = nextWorld
      game.worldColliders = activeWorldColliders(nextWorld)
      syncBeamObjects(game)
    }
    const collision = collideDrone(stepped, game.worldColliders)
    game.drone = collision.state
    game.waveStage = waveStageForTime(game.sessionTime)
    if (game.waveStage !== game.pilotPreviousThreat) {
      setBgmWave(game.waveStage)
      game.message = waveLabelForTime(game.sessionTime)
      game.messageTime = 2.2
      tone('upgrade')
    }
    syncEnemyTiers(game.enemies, game.sessionTime, game.drone.position, game.drone.heading, d)
    syncAntiAirEnemies(game.enemies, game.sessionTime, game.world.buildings)
    stepEnemies(game.enemies, game.drone.position, d)
    if (collision.hit && collision.impulse > 2.5 && game.collisionCooldown <= 0) { game.collisionCooldown = 0.45; registerImpact(game, 'BUILDING') }

    game.beamActive = input.beam
    stepTraffic(game.traffic, { position: game.drone.position, heading: game.drone.heading }, d)
    syncCrowdThreats(game)
    stepCrowds(game.crowds, { position: game.drone.position, heading: game.drone.heading, colliders: game.worldColliders, threats: game.crowdThreats, crowdThreatStart: 1 + game.traffic.cars.length + game.enemies.slots.length }, d)
    const beamField: BeamField = { active: game.beamActive, boosting: turboActive, position: game.drone.position, velocity: game.drone.velocity, radiusScale: 1 }
    if (game.beamActive && game.loadedCars < MAX_CARRIED_CARS) {
      for (const car of game.traffic.cars) {
        if (!car.active || !isInsideBeam(car, beamField)) continue
        const captured = captureTrafficCar(game.traffic, car.id)
        if (captured) game.beamObjects.unshift(makeTrafficBeamObject(captured))
      }
    }
    stepBeamObjects(game.beamObjects, beamField, d)
    stepBeamObjects(game.crowds.objects, beamField, d)
    let absorbedCrowd = beginNearbyCrowdAbsorption(game.crowds, game.drone.position)
    while (absorbedCrowd) {
      triggerLaserBurst(game.laserBursts, 'impact', absorbedCrowd.position, '#fff06d')
      absorbCrowd(game, absorbedCrowd.kind)
      absorbedCrowd = beginNearbyCrowdAbsorption(game.crowds, game.drone.position)
    }
    limitLoadedCars(game)
    game.loadedCars = loadedCarCount(game)
    for (let index = game.beamObjects.length - 1; index >= 0; index -= 1) {
      const object = game.beamObjects[index]!
      if (!object.active && object.explosionPending) {
        object.explosionPending = false
        triggerLaserBurst(game.laserBursts, 'impact', object.position, '#ff8a45')
        if (object.id.startsWith('traffic:')) { releaseTrafficSlot(game.traffic, object.id); game.beamObjects.splice(index, 1) }
      }
    }

    game.beamTargetId = null
    if (game.beamActive) {
      let nearest = Number.POSITIVE_INFINITY
      for (const object of game.beamObjects) {
        if (!object.active || !object.inBeam) continue
        const distance = Math.hypot(object.position.x - game.drone.position.x, object.position.y - game.drone.position.y, object.position.z - game.drone.position.z)
        if (distance < nearest) { nearest = distance; game.beamTargetId = object.id }
      }
      for (const object of game.crowds.objects) {
        if (!object.active || !object.inBeam) continue
        const distance = Math.hypot(object.position.x - game.drone.position.x, object.position.y - game.drone.position.y, object.position.z - game.drone.position.z)
        if (distance < nearest) { nearest = distance; game.beamTargetId = object.id }
      }
    }

    const laserPressed = laserRisingEdge(input.laser, game.laserInputHeld)
    game.laserInputHeld = input.laser
    if (laserPressed && game.laserCooldown <= 0) {
      game.laserCooldown = 0.27
      game.laserFlash = 0.12
      const aim = resolveLaserAim({ origin: game.laserAimOrigin, direction: game.laserAimDirection }, game.worldColliders, laserSphereTargets(game))
      const direction = directionToLaserAim(game.drone.position, aim)
      const projectile = fireLaserBeam(game.laserProjectiles, game.drone.position, aim.point)
      triggerLaserBurst(game.laserBursts, 'muzzle', projectile.position)
      if (aim.targetKind) triggerLaserBurst(game.laserBursts, 'impact', aim.point, aim.targetKind === 'car' ? '#ffb24d' : aim.targetKind === 'fighter' ? '#ff557f' : aim.targetKind === 'building' ? '#6deeff' : '#fff0a1')
      if (aim.targetKind === 'fighter' && aim.targetId) registerEnemyLaserHit(game, aim.targetId)
      if (aim.targetKind === 'car' && aim.targetId && destroyCar(game, aim.targetId, direction)) { game.message = 'CAR LAUNCHED · +50'; game.messageTime = 0.9 }
      game.laserShotsFired += 1
      tone('pickup')
    }
    game.laserActive = game.laserFlash > 0

    const projectileDamage = stepEnemyProjectiles(game.enemies, game.drone.position, d)
    if (projectileDamage > 0) registerImpact(game, 'ENEMY', Math.min(12, projectileDamage))
    const enemyContacts = nearbyEnemyContacts(game.enemies, game.drone.position)
    if (enemyContacts > 0) registerImpact(game, 'ENEMY', 3)
    updatePilotStatus(game)
    publishAccumulator.current += d
    if (publishAccumulator.current >= 0.06) { publishAccumulator.current = 0; publish() }
  }, [publish, readInput])

  const start = useCallback(() => {
    startBgm()
    pointer.current = { x: 0, y: 0 }
    const game = runtime.current
    game.phase = 'playing'
    game.message = 'ABSORB PEOPLE · KEEP THE CLOCK ALIVE'
    game.messageTime = 3
    publish()
  }, [publish])

  const restart = useCallback(() => {
    startBgm()
    pointer.current = { x: 0, y: 0 }
    runtime.current = makeRuntime()
    runtime.current.phase = 'playing'
    runtime.current.message = 'NEW RUN · ABSORB TIME TO SURVIVE'
    runtime.current.messageTime = 3
    publish()
  }, [publish])

  const setMobileInput = useCallback((input: Partial<MobileInput>) => { Object.assign(mobile.current, input) }, [])
  const value = useMemo<GameContextValue>(() => ({ runtime, snapshot, readInput, advance, start, restart, setMobileInput }), [advance, readInput, restart, setMobileInput, snapshot, start])
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGame must be used inside GameProvider')
  return value
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { collideDrone, createDroneState, stepDrone, type Aabb, type DroneInput, type DroneState, type Vec3 } from './core/drone'
import { beamProfile, beginCarDestruction, isInsideBeam, stepBeamObjects, type BeamField, type BeamObject } from './core/beam'
import { beginNearbyCrowdAbsorption, createCrowdState, stepCrowds, type CrowdState } from './core/crowds'
import {
  activeEnemyCount,
  createEnemyState,
  hitEnemy,
  nearbyEnemyThreats,
  stepEnemies,
  syncAntiAirEnemies,
  syncEnemyTiers,
  type EnemyState,
} from './core/enemies'
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
import {
  ENEMY_BASE_REWARD,
  MISSION_BASE_REWARD,
  STARTING_SCORE,
  TARGET_BASE_REWARD,
  createDensityCache,
  drainScore,
  scoreReward,
  updateDensityCache,
  wantedScoreMultiplier,
  type DensityCache,
} from './core/risk'
import {
  channelTarget,
  completeAbductionMission,
  completeEnemyMission,
  isMissionComplete,
  nearestBeamTarget,
  selectMission,
  stepAirshowMission,
  type Mission,
  type MissionCandidate,
  type MissionTarget,
  type TargetKind,
} from './core/missions'
import {
  activeWorldColliders,
  createActiveWorld,
  updateActiveWorld,
  WORLD_MAX_CARS,
  WORLD_REMOVE_RADIUS,
  type ActiveWorld,
  type ProceduralCar,
} from './core/world'
import { captureTrafficCar, createTrafficState, releaseTrafficSlot, stepTraffic, TRAFFIC_MAX_CARS, type TrafficCar, type TrafficState } from './core/traffic'
import { setBgmWanted, startBgm, stopBgm, tone } from './audio'

export type GamePhase = 'intro' | 'playing' | 'results'

export type CarriedTarget = {
  id: string
  label: string
  kind: TargetKind
  color: string
}

export type DroppedCaptive = CarriedTarget & {
  position: Vec3
  velocity: Vec3
  age: number
}

export type GameRuntime = {
  drone: DroneState
  world: ActiveWorld
  worldColliders: Aabb[]
  mission: Mission
  missionIndex: number
  sessionTime: number
  score: number
  completedMissions: number
  chain: number
  chainWindow: number
  wanted: number
  maxWanted: number
  heat: number
  calmTime: number
  damageCooldown: number
  turbo: number
  aimX: number
  aimY: number
  laserAimOrigin: Vec3
  laserAimDirection: Vec3
  beamActive: boolean
  beamTargetId: string | null
  laserActive: boolean
  laserInputHeld: boolean
  laserFlash: number
  laserCooldown: number
  laserShotsFired: number
  laserProjectiles: LaserProjectile[]
  laserBursts: LaserBurst[]
  laserTargets: LaserSphereTarget[]
  enemies: EnemyState
  fightersDown: number
  fighterAttackTimer: number
  policeAttackTimer: number
  carried: CarriedTarget[]
  dropped: DroppedCaptive[]
  beamObjects: BeamObject[]
  crowds: CrowdState
  traffic: TrafficState
  destroyedCars: Set<string>
  carDestructions: number
  processedCarDestructions: number
  density: DensityCache
  phase: GamePhase
  message: string
  messageTime: number
  impactFlash: number
  pickupPulse: number
  wantedPulse: number
  collisionCooldown: number
  resultTitle: string
  victory: boolean
  pilotExpression: PilotExpression
  pilotHoldUntil: number
  pilotPreviousCarried: number
  pilotPreviousWanted: number
}

export type GameSnapshot = {
  phase: GamePhase
  speed: number
  height: number
  position: Vec3
  mission: Mission
  sessionTime: number
  score: number
  completedMissions: number
  chain: number
  chainWindow: number
  wanted: number
  maxWanted: number
  heat: number
  turbo: number
  boostActive: boolean
  aimX: number
  aimY: number
  beamActive: boolean
  beamAvailable: boolean
  beamTargetId: string | null
  laserActive: boolean
  laserFlash: number
  activeFighters: number
  fightersDown: number
  riskMultiplier: number
  densityMultiplier: number
  carried: CarriedTarget[]
  dropped: DroppedCaptive[]
  beamObjectCount: number
  message: string
  impactFlash: number
  pickupPulse: number
  wantedPulse: number
  resultTitle: string
  victory: boolean
  pilotExpression: PilotExpression
}

export type PlayerInput = DroneInput & {
  beam: boolean
  laser: boolean
}

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

function makeRuntime(): GameRuntime {
  const drone = createDroneState()
  drone.position = { x: 0, y: 2.8, z: 54.5 }
  drone.heading = Math.PI
  const world = createActiveWorld(drone.position)
  const beamObjects = world.cars.map(makeBeamObject)
  const crowds = createCrowdState((Math.random() * 0xffffffff) >>> 0)
  stepCrowds(crowds, { position: drone.position, heading: drone.heading }, 0)
  const initialCandidates: MissionCandidate[] = []
  for (const object of crowds.objects) {
    if (object.active) initialCandidates.push({ id: object.id, kind: object.kind, position: object.position, color: object.color })
  }
  for (const object of beamObjects) initialCandidates.push({ id: object.id, kind: 'car', position: object.position, color: object.color })
  const mission = selectMission(0, drone.position, initialCandidates, 0)
  if (!mission) throw new Error('The active world must contain at least one mission target')
  return {
    drone,
    world,
    worldColliders: activeWorldColliders(world),
    mission,
    missionIndex: 0,
    sessionTime: 0,
    score: STARTING_SCORE,
    completedMissions: 0,
    chain: 1,
    chainWindow: 0,
    wanted: 0,
    maxWanted: 0,
    heat: 0,
    calmTime: 0,
    damageCooldown: 0,
    turbo: 1,
    aimX: 0,
    aimY: 0,
    laserAimOrigin: { ...drone.position },
    laserAimDirection: laserDirection(drone.heading, drone.pitch),
    beamActive: false,
    beamTargetId: null,
    laserActive: false,
    laserInputHeld: false,
    laserFlash: 0,
    laserCooldown: 0,
    laserShotsFired: 0,
    laserProjectiles: createLaserPool(),
    laserBursts: createLaserBurstPool(),
    laserTargets: [],
    enemies: createEnemyState(),
    fightersDown: 0,
    fighterAttackTimer: 5.5,
    policeAttackTimer: 6.5,
    carried: [],
    dropped: [],
    beamObjects,
    crowds,
    traffic: createTrafficState((Math.random() * 0xffffffff) >>> 0),
    destroyedCars: new Set<string>(),
    carDestructions: 0,
    processedCarDestructions: 0,
    density: createDensityCache(),
    phase: 'intro',
    message: 'FIRST CONTACT: CATTLE CLASSIFIED',
    messageTime: 4,
    impactFlash: 0,
    pickupPulse: 0,
    wantedPulse: 0,
    collisionCooldown: 0,
    resultTitle: '',
    victory: false,
    pilotExpression: 'normal',
    pilotHoldUntil: 0,
    pilotPreviousCarried: 0,
    pilotPreviousWanted: 0,
  }
}

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
    id: car.id,
    kind: 'car',
    mass: 2.4,
    color: car.color,
    position: { ...car.position },
    velocity: {
      x: car.axis === 'x' ? car.speed * car.direction : 0,
      y: 0,
      z: car.axis === 'z' ? car.speed * car.direction : 0,
    },
    rotation: { x: 0, y: car.rotation, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    active: true,
    inBeam: true,
    tether: 0,
    playerTouched: true,
    destroying: false,
    destroyTimer: 0,
    explosionPending: false,
    absorbing: false,
    absorbTimer: 0,
  }
}

function syncBeamObjects(game: GameRuntime) {
  const existing = new Map(game.beamObjects.map((object) => [object.id, object]))
  const retained = game.beamObjects.filter((object) =>
    object.active && (object.inBeam || object.tether > 0.02 || object.playerTouched) &&
    Math.hypot(object.position.x - game.drone.position.x, object.position.z - game.drone.position.z) <= WORLD_REMOVE_RADIUS,
  )
  const retainedIds = new Set(retained.map((object) => object.id))
  const nearby = game.world.cars
    .filter((car) => !retainedIds.has(car.id) && !game.destroyedCars.has(car.id))
    .map((car) => existing.get(car.id) ?? makeBeamObject(car))
  const capturedTraffic = retained.filter((object) => object.id.startsWith('traffic:'))
  const parked = [...retained.filter((object) => !object.id.startsWith('traffic:')), ...nearby]
    .slice(0, WORLD_MAX_CARS)
  game.beamObjects = [...capturedTraffic.slice(0, TRAFFIC_MAX_CARS), ...parked]
  const retainedTrafficIds = new Set(capturedTraffic.map((object) => object.id))
  for (const car of game.traffic.cars) {
    if (car.captured && !retainedTrafficIds.has(car.id)) releaseTrafficSlot(game.traffic, car.id)
  }
}

function copyMission(mission: Mission): Mission {
  return {
    ...mission,
    targets: mission.targets.map((target) => ({ ...target, position: { ...target.position } })),
  }
}

function writeLaserSphereTarget(
  targets: LaserSphereTarget[],
  slot: number,
  id: string,
  kind: LaserSphereTarget['kind'],
  center: Vec3,
  radius: number,
) {
  const target = targets[slot] ?? { id, kind, center: { x: 0, y: 0, z: 0 }, radius }
  target.id = id
  target.kind = kind
  target.center.x = center.x
  target.center.y = center.y
  target.center.z = center.z
  target.radius = radius
  targets[slot] = target
  return slot + 1
}

function laserSphereTargets(game: GameRuntime): LaserSphereTarget[] {
  const targets = game.laserTargets
  let slot = 0
  for (const enemy of game.enemies.slots) {
    if (!enemy.active) continue
    const radius = enemy.kind === 'balloon' ? 5.5 : enemy.kind === 'soldier' ? 1.1 : enemy.kind === 'anti-air' ? 1.8 : 2.1
    slot = writeLaserSphereTarget(targets, slot, enemy.id, 'fighter', enemy.position, radius)
  }
  for (const object of game.beamObjects) {
    if (!object.active || object.destroying) continue
    slot = writeLaserSphereTarget(targets, slot, object.id, 'car', object.position, 1.7)
  }
  for (const car of game.traffic.cars) {
    if (car.active) slot = writeLaserSphereTarget(targets, slot, car.id, 'car', car.position, 1.7)
  }
  targets.length = slot
  return targets
}

function registerEnemyLaserHit(game: GameRuntime, id: string) {
  const result = hitEnemy(game.enemies, id)
  if (!result.destroyed || !result.kind) return
  game.fightersDown += 1
  game.fighterAttackTimer = Math.max(game.fighterAttackTimer, 3.2)
  const reward = scoreReward(ENEMY_BASE_REWARD, game.wanted, game.chain)
  game.score += reward
  game.message = `${result.kind.toUpperCase()} POPPED · +${reward}`
  game.messageTime = 1.4
  if (completeEnemyMission(game.mission, id)) finishMission(game)
  tone('upgrade')
}

function destroyCar(game: GameRuntime, id: string, direction: Vec3) {
  let target: BeamObject | null = null
  for (const object of game.beamObjects) {
    if (object.id === id && object.active) { target = object; break }
  }
  if (!target) {
    const captured = captureTrafficCar(game.traffic, id)
    if (captured) {
      target = makeTrafficBeamObject(captured)
      game.beamObjects.unshift(target)
    }
  }
  if (!target || !beginCarDestruction(target, direction, game.drone.velocity)) return false
  game.destroyedCars.add(id)
  game.carDestructions += 1
  return true
}

function snapshotOf(game: GameRuntime): GameSnapshot {
  return {
    phase: game.phase,
    speed: Math.hypot(game.drone.velocity.x, game.drone.velocity.y, game.drone.velocity.z),
    height: game.drone.position.y,
    position: { ...game.drone.position },
    mission: copyMission(game.mission),
    sessionTime: game.sessionTime,
    score: game.score,
    completedMissions: game.completedMissions,
    chain: game.chain,
    chainWindow: game.chainWindow,
    wanted: game.wanted,
    maxWanted: game.maxWanted,
    heat: game.heat,
    turbo: game.turbo,
    boostActive: game.drone.boostRemaining > 0,
    aimX: game.aimX,
    aimY: game.aimY,
    beamActive: game.beamActive,
    beamAvailable: true,
    beamTargetId: game.beamTargetId,
    laserActive: game.laserActive,
    laserFlash: game.laserFlash,
    activeFighters: activeEnemyCount(game.enemies, 'fighter'),
    fightersDown: game.fightersDown,
    riskMultiplier: wantedScoreMultiplier(game.wanted),
    densityMultiplier: game.density.heatMultiplier,
    carried: game.carried.map((item) => ({ ...item })),
    dropped: game.dropped.map((item) => ({ ...item, position: { ...item.position }, velocity: { ...item.velocity } })),
    beamObjectCount: game.beamObjects.filter((object) => object.active && object.inBeam).length
      + game.crowds.objects.filter((object) => object.active && object.inBeam).length,
    message: game.messageTime > 0 ? game.message : '',
    impactFlash: game.impactFlash,
    pickupPulse: game.pickupPulse,
    wantedPulse: game.wantedPulse,
    resultTitle: game.resultTitle,
    victory: game.victory,
    pilotExpression: game.pilotExpression,
  }
}

function updatePilotStatus(game: GameRuntime) {
  const carriedIncreased = game.carried.length > game.pilotPreviousCarried
  const wantedIncreased = game.wanted > game.pilotPreviousWanted
  const next = requestedPilotExpression({
    elapsed: game.sessionTime,
    impact: game.impactFlash > 0,
    wanted: game.wanted,
    wantedIncreased,
    carriedIncreased,
    phase: game.phase,
    victory: game.victory,
    boost: game.drone.boostRemaining > 0,
    beam: game.beamActive,
    laser: game.laserActive,
  })
  const state = updatePilotExpression({
    expression: game.pilotExpression,
    holdUntil: game.pilotHoldUntil,
  }, next, game.sessionTime)
  game.pilotExpression = state.expression
  game.pilotHoldUntil = state.holdUntil
  game.pilotPreviousCarried = game.carried.length
  game.pilotPreviousWanted = game.wanted
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

function raiseWanted(game: GameRuntime) {
  if (game.wanted >= 5) return
  game.wanted += 1
  setBgmWanted(game.wanted)
  game.wantedPulse = 1
  game.maxWanted = Math.max(game.maxWanted, game.wanted)
  game.fighterAttackTimer = Math.max(game.fighterAttackTimer, 2.2)
  if (game.wanted === 5) {
    game.message = `FIVE STARS · RISK x${wantedScoreMultiplier(game.wanted).toFixed(1)}`
    game.messageTime = 3
  }
}

function dropCaptive(game: GameRuntime) {
  const captive = game.carried.pop()
  if (!captive) return
  const angle = game.drone.heading + Math.PI * 0.7
  game.dropped.push({
    ...captive,
    position: { ...game.drone.position, y: game.drone.position.y - 0.6 },
    velocity: {
      x: game.drone.velocity.x * 0.35 + Math.sin(angle) * 2,
      y: 2.3,
      z: game.drone.velocity.z * 0.35 + Math.cos(angle) * 2,
    },
    age: 0,
  })
}

function registerImpact(game: GameRuntime, source: 'POLICE' | 'FIGHTER' | 'BUILDING') {
  if (game.damageCooldown > 0 || game.phase !== 'playing') return
  game.damageCooldown = 1.05
  game.impactFlash = 1
  dropCaptive(game)
  game.message = `${source} IMPACT — NO DAMAGE`
  game.messageTime = 1.8
  tone(source === 'BUILDING' ? 'impact' : 'warning')
  if ('vibrate' in navigator) navigator.vibrate?.([35, 20, 35])
}

function secureTarget(game: GameRuntime, target: MissionTarget, absorbed = false) {
  if (target.kind === 'cat' || target.kind === 'pedestrian') {
    if (!absorbed) game.carried.push({ id: target.id, label: target.label, kind: target.kind, color: target.color })
    game.pickupPulse = 1
    if (!absorbed && game.carried.length > 4) game.carried.shift()
    game.message = absorbed ? `${target.label} ABSORBED` : `${target.label} ACQUIRED`
    tone('pickup')
  }
  game.messageTime = 1.2
  game.score += scoreReward(TARGET_BASE_REWARD, game.wanted, game.chain)
}

function missionCandidates(game: GameRuntime) {
  const candidates: MissionCandidate[] = []
  for (const object of game.crowds.objects) {
    if (object.active && !object.inBeam && !object.absorbing) candidates.push({ id: object.id, kind: object.kind, position: object.position, color: object.color })
  }
  for (const object of game.beamObjects) {
    if (object.active && !object.destroying) candidates.push({ id: object.id, kind: 'car', position: object.position, color: object.color })
  }
  for (const car of game.traffic.cars) {
    if (car.active) candidates.push({ id: car.id, kind: 'car', position: car.position, color: car.color })
  }
  for (const enemy of game.enemies.slots) {
    if (enemy.active) candidates.push({ id: enemy.id, kind: 'enemy', position: enemy.position, label: enemy.kind.toUpperCase(), color: '#ff5d7f' })
  }
  return candidates
}

function selectNextMission(game: GameRuntime) {
  const next = selectMission(game.missionIndex, game.drone.position, missionCandidates(game), game.wanted)
  if (!next) return false
  game.mission = next
  return true
}

function missionSource(game: GameRuntime, target: MissionTarget) {
  if (target.kind === 'cat' || target.kind === 'pedestrian') {
    for (const object of game.crowds.objects) if (object.active && object.id === target.id) return object
    return null
  }
  if (target.kind === 'car') {
    for (const object of game.beamObjects) if (object.active && object.id === target.id) return object
    for (const car of game.traffic.cars) if (car.active && car.id === target.id) return car
    return null
  }
  for (const enemy of game.enemies.slots) if (enemy.active && enemy.id === target.id) return enemy
  return null
}

function syncMissionObjective(game: GameRuntime, dt: number) {
  const target = game.mission.targets[0]
  if (!target?.active) return
  const source = missionSource(game, target)
  if (!source) {
    game.missionIndex += 1
    selectNextMission(game)
    return
  }
  target.position.x = source.position.x
  target.position.y = source.position.y
  target.position.z = source.position.z
  if (target.kind === 'car' && stepAirshowMission(game.mission, {
    position: source.position,
    inBeam: 'inBeam' in source && source.inBeam,
  }, dt)) finishMission(game)
}

function finishMission(game: GameRuntime) {
  const chained = game.completedMissions > 0 && game.chainWindow > 0
  game.chain = chained ? Math.min(5, game.chain + 1) : 1
  game.chainWindow = 32
  game.completedMissions += 1
  const reward = scoreReward(MISSION_BASE_REWARD, game.wanted, game.chain)
  game.score += reward
  raiseWanted(game)
  game.heat = Math.max(game.heat, 0.18)
  game.missionIndex += 1
  selectNextMission(game)
  if (game.wanted < 5) {
    game.message = `MISSION +${reward} · RISK x${wantedScoreMultiplier(game.wanted).toFixed(2)} · CHAIN x${game.chain}`
    game.messageTime = 2.8
  }
  tone('delivery')
}

export function GameProvider({ children }: { children: ReactNode }) {
  const runtime = useRef(makeRuntime())
  const [snapshot, setSnapshot] = useState(() => snapshotOf(runtime.current))
  const keys = useRef<Record<string, boolean>>({})
  const pointer = useRef({ x: 0, y: 0 })
  const mobile = useRef<MobileInput>({
    throttle: 0,
    steer: 0,
    vertical: 0,
    special: false,
    beam: false,
    laser: false,
    active: false,
  })
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
    const mouseSteer = pointerMagnitude < 0.08
      ? 0
      : -Math.sign(pointer.current.x) * Math.pow((pointerMagnitude - 0.08) / 0.92, 1.18)
    const keyboard: PlayerInput = {
      throttle: (keys.current.KeyW || keys.current.ArrowUp ? 1 : 0) - (keys.current.KeyS || keys.current.ArrowDown ? 1 : 0),
      steer: mouseSteer,
      strafe: (keys.current.KeyA || keys.current.ArrowLeft ? 1 : 0) - (keys.current.KeyD || keys.current.ArrowRight ? 1 : 0),
      lookPitch: -pointer.current.y,
      vertical: 0,
      special: Boolean(keys.current.Space),
      beam: Boolean(keys.current.KeyE),
      laser: Boolean(keys.current.KeyQ),
    }
    return mobile.current.active ? {
      throttle: mobile.current.throttle,
      steer: mobile.current.steer,
      strafe: mobile.current.strafe ?? 0,
      lookPitch: mobile.current.lookPitch ?? 0,
      vertical: mobile.current.vertical,
      special: mobile.current.special,
      beam: mobile.current.beam,
      laser: mobile.current.laser,
    } : keyboard
  }, [])

  const advance = useCallback((dt: number) => {
    const game = runtime.current
    if (game.phase !== 'playing') return
    const d = Math.min(dt, 0.05)
    const input = readInput()
    game.aimX = pointer.current.x
    game.aimY = pointer.current.y
    game.sessionTime += d
    game.score = drainScore(game.score, d)
    if (game.score <= 0) {
      endRun(game, 'INFAMY DEPLETED', false)
      updatePilotStatus(game)
      publish()
      return
    }
    game.messageTime = Math.max(0, game.messageTime - d)
    game.impactFlash = Math.max(0, game.impactFlash - d * 5)
    game.pickupPulse = Math.max(0, game.pickupPulse - d * 3.2)
    game.wantedPulse = Math.max(0, game.wantedPulse - d * 2.2)
    game.collisionCooldown = Math.max(0, game.collisionCooldown - d)
    game.damageCooldown = Math.max(0, game.damageCooldown - d)
    game.laserCooldown = Math.max(0, game.laserCooldown - d)
    game.laserFlash = Math.max(0, game.laserFlash - d)
    stepLaserBursts(game.laserBursts, d)
    stepLaserProjectiles(game.laserProjectiles, d)
    game.chainWindow = Math.max(0, game.chainWindow - d)

    const turboActive = input.special && game.turbo > 0.02
    if (turboActive) {
      if (game.drone.boostRemaining <= 0) {
        game.message = input.beam ? 'TURBO + BEAM AMPLIFIED' : 'TURBO ENGAGED'
        game.messageTime = 1.2
        tone('upgrade')
      }
      game.turbo = Math.max(0, game.turbo - d * 0.31)
      game.drone.boostRemaining = Math.max(game.drone.boostRemaining, 0.12)
    } else {
      game.turbo = Math.min(1, game.turbo + d * 0.13)
    }

    const flightInput: DroneInput = { ...input, special: false }
    const stepped = stepDrone(game.drone, flightInput, d, game.carried.length, UFO_UPGRADES)
    const nextWorld = updateActiveWorld(game.world, stepped.position)
    if (nextWorld !== game.world) {
      game.world = nextWorld
      game.worldColliders = activeWorldColliders(nextWorld)
      syncBeamObjects(game)
    }
    const collision = collideDrone(stepped, game.worldColliders)
    game.drone = collision.state
    syncEnemyTiers(game.enemies, game.wanted, game.drone.position, game.drone.heading, d)
    syncAntiAirEnemies(game.enemies, game.wanted, game.world.buildings)
    stepEnemies(game.enemies, game.drone.position, d)
    if (collision.hit && collision.impulse > 2.5 && game.collisionCooldown <= 0) {
      game.collisionCooldown = 0.45
      registerImpact(game, 'BUILDING')
    }

    game.beamActive = input.beam
    stepTraffic(game.traffic, {
      position: game.drone.position,
      heading: game.drone.heading,
    }, d)
    stepCrowds(game.crowds, {
      position: game.drone.position,
      heading: game.drone.heading,
    }, d)
    updateDensityCache(
      game.density,
      game.drone.position,
      game.world.buildings,
      game.crowds.nearbyPedestrians,
      game.beamObjects,
      game.traffic.cars,
    )
    const destructionDelta = game.carDestructions - game.processedCarDestructions
    if (destructionDelta > 0) {
      game.heat += destructionDelta * 0.16 * game.density.heatMultiplier
      game.processedCarDestructions = game.carDestructions
    }
    const beamField: BeamField = {
      active: game.beamActive,
      boosting: turboActive,
      position: game.drone.position,
      velocity: game.drone.velocity,
      radiusScale: 1,
    }
    if (game.beamActive) {
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
      const missionTarget = game.mission.targets[0]
      if (completeAbductionMission(game.mission, absorbedCrowd.id) && missionTarget) {
        secureTarget(game, missionTarget, true)
        finishMission(game)
      } else {
        game.score += scoreReward(18, game.wanted, game.chain)
        game.pickupPulse = 1
        game.message = `${absorbedCrowd.kind.toUpperCase()} ABSORBED`
        game.messageTime = 0.8
        tone('pickup')
      }
      absorbedCrowd = beginNearbyCrowdAbsorption(game.crowds, game.drone.position)
    }
    for (let objectIndex = game.beamObjects.length - 1; objectIndex >= 0; objectIndex -= 1) {
      const object = game.beamObjects[objectIndex]!
      if (!object.active && object.explosionPending) {
        object.explosionPending = false
        triggerLaserBurst(game.laserBursts, 'impact', object.position, '#ff8a45')
        if (object.id.startsWith('traffic:')) {
          releaseTrafficSlot(game.traffic, object.id)
          game.beamObjects.splice(objectIndex, 1)
        }
      }
    }
    syncMissionObjective(game, d)
    game.beamTargetId = null
    if (game.beamActive) {
      const profile = beamProfile(turboActive)
      const groundDrop = Math.max(0, Math.min(profile.maxDrop, game.drone.position.y - 0.75))
      const target = nearestBeamTarget(
        game.mission,
        game.drone.position,
        profile.baseRadius + groundDrop * profile.coneSpread,
        profile.maxDrop,
      )
      if (target) {
        game.beamTargetId = target.id
        const result = channelTarget(game.mission, target.id, d)
        if (game.completedMissions > 0) {
          const altitudeFactor = game.drone.position.y < 4 ? 0.56 : 1
          game.heat += d * (target.kind === 'car' ? 0.17 : 0.08) * altitudeFactor * game.density.heatMultiplier
        }
        if (result.completed && result.target) {
          secureTarget(game, result.target)
          game.beamTargetId = null
          if (isMissionComplete(game.mission)) finishMission(game)
        }
      }
    }

    const enemyThreats = nearbyEnemyThreats(game.enemies, game.drone.position)
    const laserPressed = laserRisingEdge(input.laser, game.laserInputHeld)
    game.laserInputHeld = input.laser
    if (laserPressed && game.laserCooldown <= 0) {
      game.laserCooldown = 0.27
      game.laserFlash = 0.12
      const aim = resolveLaserAim({
        origin: game.laserAimOrigin,
        direction: game.laserAimDirection,
      }, game.worldColliders, laserSphereTargets(game))
      const direction = directionToLaserAim(game.drone.position, aim)
      const projectile = fireLaserBeam(game.laserProjectiles, game.drone.position, aim.point)
      triggerLaserBurst(game.laserBursts, 'muzzle', projectile.position)
      if (aim.targetKind) {
        const impactColor = aim.targetKind === 'car'
          ? '#ffb24d'
          : aim.targetKind === 'fighter'
            ? '#ff557f'
            : aim.targetKind === 'building'
              ? '#6deeff'
              : '#fff0a1'
        triggerLaserBurst(game.laserBursts, 'impact', aim.point, impactColor)
      }
      if (aim.targetKind === 'fighter' && aim.targetId) registerEnemyLaserHit(game, aim.targetId)
      if (aim.targetKind === 'car' && aim.targetId && destroyCar(game, aim.targetId, direction)) {
        game.message = 'CAR LAUNCHED'
        game.messageTime = 0.9
      }
      game.laserShotsFired += 1
      game.heat += 0.035 * game.density.heatMultiplier
      tone('pickup')
    }
    game.laserActive = game.laserFlash > 0

    if (game.completedMissions > 0 && game.wanted < 5 && game.heat >= 1) {
      game.heat = 0.25
      raiseWanted(game)
      game.message = `HEAT SPIKE — STAR ${game.wanted}`
      game.messageTime = 2
      tone('warning')
    }

    const horizontalSpeed = Math.hypot(game.drone.velocity.x, game.drone.velocity.z)
    if (game.wanted > 0 && game.drone.position.y < 3.4 && horizontalSpeed < 4 && !game.beamActive && !game.laserActive && !turboActive) {
      game.calmTime += d
      game.heat = Math.max(0, game.heat - d * 0.09)
      if (game.calmTime >= 7) {
        game.calmTime = 0
        game.wanted = Math.max(0, game.wanted - 1)
        game.message = 'LOST THE COPS — HEAT DOWN'
        game.messageTime = 2
      }
    } else {
      game.calmTime = Math.max(0, game.calmTime - d * 2)
    }

    if (enemyThreats > 0) {
      game.fighterAttackTimer -= d * (game.drone.position.y >= 6 ? 1.25 : 0.42)
      if (game.fighterAttackTimer <= 0) {
        registerImpact(game, 'FIGHTER')
        game.fighterAttackTimer = Math.max(2.7, 5.2 - game.wanted * 0.38)
      }
    } else {
      game.fighterAttackTimer = Math.max(game.fighterAttackTimer, 1.8)
    }

    if (game.wanted >= 2 && game.drone.position.y < 3.2) {
      game.policeAttackTimer -= d
      if (game.policeAttackTimer <= 0) {
        registerImpact(game, 'POLICE')
        game.policeAttackTimer = Math.max(3.3, 6.2 - game.wanted * 0.42)
      }
    } else {
      game.policeAttackTimer = Math.max(game.policeAttackTimer, 2)
    }

    game.dropped = game.dropped.filter((item) => {
      item.age += d
      item.velocity.y -= 9.8 * d
      item.position.x += item.velocity.x * d
      item.position.y += item.velocity.y * d
      item.position.z += item.velocity.z * d
      if (item.position.y < 0.65) {
        item.position.y = 0.65
        item.velocity.y = Math.abs(item.velocity.y) * 0.25
        item.velocity.x *= Math.pow(0.72, d * 60)
        item.velocity.z *= Math.pow(0.72, d * 60)
      }
      return item.age < 7
    })

    updatePilotStatus(game)

    publishAccumulator.current += d
    if (publishAccumulator.current >= 0.06 || (game.phase as GamePhase) === 'results') {
      publishAccumulator.current = 0
      publish()
    }
  }, [publish, readInput])

  const start = useCallback(() => {
    startBgm()
    pointer.current = { x: 0, y: 0 }
    const game = runtime.current
    game.phase = 'playing'
    game.message = 'HOLD E ABOVE A TARGET'
    game.messageTime = 3
    publish()
  }, [publish])

  const restart = useCallback(() => {
    startBgm()
    pointer.current = { x: 0, y: 0 }
    runtime.current = makeRuntime()
    runtime.current.phase = 'playing'
    runtime.current.message = 'NEW RAID — FIND THE GREEN TARGETS'
    runtime.current.messageTime = 3
    publish()
  }, [publish])

  const setMobileInput = useCallback((input: Partial<MobileInput>) => {
    Object.assign(mobile.current, input)
  }, [])

  const value = useMemo<GameContextValue>(() => ({
    runtime,
    snapshot,
    readInput,
    advance,
    start,
    restart,
    setMobileInput,
  }), [advance, readInput, restart, setMobileInput, snapshot, start])

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGame must be used inside GameProvider')
  return value
}

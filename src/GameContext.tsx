import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { collideDrone, createDroneState, stepDrone, type Aabb, type DroneInput, type DroneState, type Vec3 } from './core/drone'
import { absorptionScore, beamObjectDiameter, beamProfile, beginCarDestruction, beginNearbyBeamObjectAbsorption, isInsideBeam, stepBeamObjects, type BeamField, type BeamObject } from './core/beam'
import { createCrowdState, stepCrowds, type CrowdState } from './core/crowds'
import { crowdSpawnZonesAround, parkingCarsAround, type CrowdSpawnZone } from './core/cityLandmarks'
import { STRINGS, readStoredLanguage, storeLanguage, type Language, type MessageKey } from './i18n'
import { createDaylightSample, sampleDaylight, type DaylightSample } from './core/daylight'
import {
  createHazardState,
  detonateReachedHazard,
  stepHazards,
  type HazardState,
} from './core/hazards'
import {
  SIZE_MIN,
  SIZE_START,
  growSizeBy,
  growSize,
  isSizeFatal,
  shrinkSize,
  sizeProfile,
  ufoDiameter,
  type SizeGainKind,
  type SizeLossKind,
  type SizeProfile,
} from './core/size'
import { activeEnemyCount, createEnemyState, hitEnemy, resolveEnemyContacts, stepEnemies, stepEnemyProjectiles, syncAntiAirEnemies, syncEnemyTiers, waveLabelForTime, waveStageForTime, type EnemyState } from './core/enemies'
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
import { activeWeaponProjectileCount, createWeaponState, stepWeapons, type WeaponHitHandler, type WeaponId, type WeaponState, type WeaponTarget, type WeaponView } from './core/weapons'

export type GamePhase = 'intro' | 'playing' | 'results'

// The clock is the round length, not a resource. Absorbing no longer buys time:
// size is the only thing the player is managing, so there is one number to read
// and one way to lose.
export const RUN_SECONDS = 180
export const SURVIVAL_TARGET_TIME = RUN_SECONDS

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
  selectedWeapon: WeaponId
  weapons: WeaponState
  weaponTargets: WeaponTarget[]
  weaponView: WeaponView
  weaponHitHandler: WeaponHitHandler
  enemies: EnemyState
  enemiesDown: number
  beamObjects: BeamObject[]
  crowds: CrowdState
  traffic: TrafficState
  destroyedCars: Set<string>
  crowdThreats: Vec3[]
  crowdSpawnZones: CrowdSpawnZone[]
  phase: GamePhase
  message: string
  messageKey: MessageKey | null
  messageArg: number
  messageTime: number
  impactFlash: number
  hitstop: number
  size: number
  sizeProfile: SizeProfile
  sizePulse: number
  absorbedCount: number
  ballast: number
  hazards: HazardState
  daze: number
  dumpLockout: number
  daylight: DaylightSample
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
  daylightLabel: string
  nightFactor: number
  size: number
  sizeRatio: number
  sizeMin: number
  sizePulse: number
  absorbedCount: number
  ballast: number
  daze: number
  loadedCars: number
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
  selectedWeapon: WeaponId
  weaponShotsFired: number
  activeWeaponProjectiles: number
  activeEnemies: number
  enemiesDown: number
  beamObjectCount: number
  message: string
  messageKey: MessageKey | null
  messageArg: number
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
export type RenderQuality = 'high' | 'low'

const QUALITY_STORAGE_KEY = 'ufo-attack-quality'

function readStoredQuality(): RenderQuality {
  if (typeof window === 'undefined') return 'high'
  try {
    return window.localStorage.getItem(QUALITY_STORAGE_KEY) === 'low' ? 'low' : 'high'
  } catch {
    // Private-mode browsers throw on storage access; the default is fine.
    return 'high'
  }
}

type GameContextValue = {
  runtime: React.MutableRefObject<GameRuntime>
  snapshot: GameSnapshot
  readInput: () => PlayerInput
  advance: (dt: number) => void
  start: () => void
  restart: () => void
  selectWeapon: (weapon: WeaponId) => void
  quality: RenderQuality
  setQuality: (quality: RenderQuality) => void
  language: Language
  setLanguage: (language: Language) => void
  t: (typeof STRINGS)[Language]
  setMobileInput: (input: Partial<MobileInput>) => void
}

const GameContext = createContext<GameContextValue | null>(null)
const UFO_UPGRADES = { speed: 0.45, stability: 0, rack: 0, special: 'none' as const }
const HITSTOP_TIME = 0.05
/** Converts hanging mass into flight load. A single car (mass 2.4) should be
 *  felt immediately; three should be close to crippling. */
const BALLAST_DRAG = 0.85
/**
 * A detonation makes the craft sluggish; it never takes the controls away.
 * Input keeps registering, it just responds badly, so the player is still
 * flying instead of watching. Stuns are the most frustrating thing a game can
 * do, and this one already costs a lot of size.
 */
const DAZE_TIME = 1.2
const DAZE_DRAG = 9
/**
 * Refuses new pickups briefly after a dump. Without it the still-held beam
 * re-grabs whatever was just released on the next frame, and the escape hatch
 * does nothing - measured as ballast never dropping after pressing release.
 */
const DUMP_LOCKOUT = 0.7

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
    diameter: 2.9,
    scoreValue: 70,
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

function makeRuntime(initialWeapon: WeaponId = 'homing-missile'): GameRuntime {
  const drone = createDroneState()
  // Start around the city's mid-rise band instead of at street level. The
  // opening view immediately reads as flying between buildings.
  drone.position = { x: 0, y: 18, z: 54.5 }
  drone.heading = Math.PI
  const world = createActiveWorld(drone.position)
  const crowdSpawnZones = crowdSpawnZonesAround(drone.position)
  const crowds = createCrowdState((Math.random() * 0xffffffff) >>> 0)
  stepCrowds(crowds, { position: drone.position, heading: drone.heading, colliders: activeWorldColliders(world), spawnZones: crowdSpawnZones }, 0)
  const traffic = createTrafficState((Math.random() * 0xffffffff) >>> 0)
  const enemies = createEnemyState()
  const crowdThreats = [{ ...drone.position }, ...traffic.cars.map((car) => ({ ...car.position })), ...enemies.slots.map((enemy) => ({ ...enemy.position })), ...crowds.objects.map((object) => ({ ...object.position }))]
  const weapons = createWeaponState(initialWeapon)
  const weaponTargets: WeaponTarget[] = []
  const weaponView: WeaponView = { position: drone.position, heading: drone.heading, pitch: drone.pitch, targets: weaponTargets }
  let runtime: GameRuntime
  runtime = {
    drone,
    world,
    worldColliders: activeWorldColliders(world),
    sessionTime: 0,
    remainingTime: RUN_SECONDS,
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
    selectedWeapon: initialWeapon,
    weapons,
    weaponTargets,
    weaponView,
    weaponHitHandler: (targetId, damage) => registerEnemyHit(runtime, targetId, damage, 'AUTO'),
    enemies,
    enemiesDown: 0,
    beamObjects: [...parkingCarsAround(drone.position), ...world.cars].slice(0, WORLD_MAX_CARS).map(makeBeamObject),
    crowds,
    traffic,
    destroyedCars: new Set<string>(),
    crowdThreats,
    crowdSpawnZones,
    phase: 'intro',
    message: '',
    messageKey: 'msgRunStart',
    messageArg: 0,
    messageTime: 4,
    impactFlash: 0,
    hitstop: 0,
    size: SIZE_START,
    sizeProfile: sizeProfile(SIZE_START),
    sizePulse: 0,
    absorbedCount: 0,
    ballast: 0,
    hazards: createHazardState(),
    daze: 0,
    dumpLockout: 0,
    daylight: createDaylightSample(),
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
  return runtime
}

function syncBeamObjects(game: GameRuntime) {
  const existing = new Map(game.beamObjects.map((object) => [object.id, object]))
  const retained = game.beamObjects.filter((object) => object.active && (object.inBeam || object.tether > 0.02 || object.playerTouched) && Math.hypot(object.position.x - game.drone.position.x, object.position.z - game.drone.position.z) <= WORLD_REMOVE_RADIUS)
  const retainedIds = new Set(retained.map((object) => object.id))
  const sourceCars = [...parkingCarsAround(game.drone.position), ...game.world.cars]
  const nearby = sourceCars.filter((car) => !retainedIds.has(car.id) && !game.destroyedCars.has(car.id)).map((car) => {
    const previous = existing.get(car.id)
    return previous?.active ? previous : makeBeamObject(car)
  })
  const capturedTraffic = retained.filter((object) => object.id.startsWith('traffic:'))
  const parked = [...retained.filter((object) => !object.id.startsWith('traffic:')), ...nearby].slice(0, WORLD_MAX_CARS)
  game.beamObjects = [...capturedTraffic.slice(0, TRAFFIC_MAX_CARS), ...parked]
  const retainedTrafficIds = new Set(capturedTraffic.map((object) => object.id))
  for (const car of game.traffic.cars) if (car.captured && !retainedTrafficIds.has(car.id)) releaseTrafficSlot(game.traffic, car.id)
}

function writeLaserSphereTarget(targets: LaserSphereTarget[], slot: number, id: string, center: Vec3, radius: number) {
  const target = targets[slot] ?? { id, kind: 'fighter' as const, center: { x: 0, y: 0, z: 0 }, radius }
  target.id = id
  target.kind = id.startsWith('car:') || id.startsWith('traffic:') || id.startsWith('parking-car:') ? 'car' : 'fighter'
  target.center.x = center.x
  target.center.y = center.y
  target.center.z = center.z
  target.radius = radius
  targets[slot] = target
  return slot + 1
}

function writeWeaponTarget(targets: WeaponTarget[], slot: number, id: string, center: Vec3, radius: number) {
  const target = targets[slot] ?? { id, center: { x: 0, y: 0, z: 0 }, radius }
  target.id = id
  target.center.x = center.x
  target.center.y = center.y
  target.center.z = center.z
  target.radius = radius
  targets[slot] = target
  return slot + 1
}

function syncWeaponTargets(game: GameRuntime) {
  let slot = 0
  for (const enemy of game.enemies.slots) {
    if (!enemy.active || enemy.absorbing) continue
    slot = writeWeaponTarget(game.weaponTargets, slot, enemy.id, enemy.position, enemy.kind === 'boss' ? 7 : enemy.hitRadius)
  }
  game.weaponTargets.length = slot
  return game.weaponTargets
}

function laserSphereTargets(game: GameRuntime) {
  let slot = 0
  for (const enemy of game.enemies.slots) if (enemy.active && !enemy.absorbing) slot = writeLaserSphereTarget(game.laserTargets, slot, enemy.id, enemy.position, enemy.kind === 'boss' ? 7 : enemy.hitRadius)
  for (const object of game.beamObjects) if (object.active && !object.destroying && !object.absorbing) slot = writeLaserSphereTarget(game.laserTargets, slot, object.id, object.position, 1.7)
  for (const car of game.traffic.cars) if (car.active) slot = writeLaserSphereTarget(game.laserTargets, slot, car.id, car.position, 1.7)
  game.laserTargets.length = slot
  return game.laserTargets
}

/**
 * Total mass hanging off the beam.
 *
 * Oversized objects stay as ballast until the growing craft crosses their
 * diameter gate. Mass rather than a count makes a tanker meaningfully heavier
 * than a person while it is still too large to swallow.
 *
 * This is where the entire speed penalty comes from. A wider beam - which is
 * what growing buys - sweeps up more targets but also fouls more easily, so the
 * temporary tax lands on sloppy beam work rather than on being large.
 */
function beamBallast(game: GameRuntime) {
  let mass = 0
  for (const object of game.beamObjects) {
    if (!object.active || (!object.inBeam && object.tether <= 0.02)) continue
    mass += object.mass
  }
  for (const hazard of game.hazards.objects) {
    if (!hazard.active || (!hazard.inBeam && hazard.tether <= 0.02)) continue
    mass += hazard.mass
  }
  for (const enemy of game.enemies.slots) {
    if (!enemy.active || (!enemy.inBeam && enemy.tether <= 0.02)) continue
    mass += enemy.mass
  }
  return mass
}

function loadedCarCount(game: GameRuntime) {
  let count = 0
  for (const object of game.beamObjects) if (object.active && (object.inBeam || object.tether > 0.02)) count += 1
  for (const object of game.crowds.objects) if (object.active && (object.inBeam || object.tether > 0.02)) count += 1
  for (const object of game.hazards.objects) if (object.active && (object.inBeam || object.tether > 0.02)) count += 1
  for (const object of game.enemies.slots) if (object.active && (object.inBeam || object.tether > 0.02)) count += 1
  return count
}

function dropCars(game: GameRuntime) {
  let dropped = 0
  // Hazards release too: dumping the load is the escape hatch, and it has to
  // work on the thing you most want to get rid of.
  for (const hazard of game.hazards.objects) {
    if (!hazard.active || (!hazard.inBeam && hazard.tether <= 0.02)) continue
    hazard.inBeam = false
    hazard.tether = 0
  }
  for (const enemy of game.enemies.slots) {
    if (!enemy.active || (!enemy.inBeam && enemy.tether <= 0.02)) continue
    enemy.inBeam = false
    enemy.tether = 0
    dropped += 1
  }
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
    setMessage(game, 'msgDumped', 1.1, dropped)
    game.messageTime = 1.1
    tone('upgrade')
  }
}

function registerEnemyHit(game: GameRuntime, id: string, damage: number, source: 'LASER' | 'AUTO') {
  const result = hitEnemy(game.enemies, id, damage)
  if (!result.destroyed || !result.kind) return
  const reward = result.kind === 'boss' ? 1200 : result.kind === 'tank' ? 260 : result.kind === 'anti-air' ? 180 : result.kind === 'fighter' ? 140 : result.kind === 'helicopter' ? 80 : result.kind === 'police-car' ? 55 : 35
  game.enemiesDown += 1
  game.score += reward
  setMessage(game, 'msgEnemyDown', 1.4, reward)
  tone('upgrade')
}

function registerEnemyLaserHit(game: GameRuntime, id: string) {
  registerEnemyHit(game, id, 1, 'LASER')
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

function grow(game: GameRuntime, kind: SizeGainKind) {
  const before = game.size
  game.size = growSize(game.size, kind)
  game.sizeProfile = sizeProfile(game.size)
  game.sizePulse = 1
  return game.size - before
}

function growBy(game: GameRuntime, amount: number) {
  const before = game.size
  game.size = growSizeBy(game.size, amount)
  game.sizeProfile = sizeProfile(game.size)
  game.sizePulse = 1
  return game.size - before
}

/** Every shrink runs through here so the fail check lives in exactly one place. */
function shrink(game: GameRuntime, kind: SizeLossKind) {
  game.size = shrinkSize(game.size, kind)
  game.sizeProfile = sizeProfile(game.size)
  game.sizePulse = 1
  if (isSizeFatal(game.size)) endRun(game, 'CORE COLLAPSED', false)
}

function absorbCrowd(game: GameRuntime, kind: 'cat' | 'pedestrian') {
  // Score scales with size, so a big craft earns more per body. Growing is
  // worth chasing beyond simply staying alive.
  const reward = Math.round((kind === 'cat' ? 40 : 15) * game.sizeProfile.scoreMultiplier)
  grow(game, kind)
  game.absorbedCount += 1
  game.score += reward
  game.pickupPulse = 1
  setMessage(game, kind === 'cat' ? 'msgAbsorbedCat' : 'msgAbsorbedPerson', 1.25, reward)
  tone('pickup')
}

function absorbBeamObject(game: GameRuntime, object: BeamObject) {
  const diameter = beamObjectDiameter(object)
  const reward = absorptionScore(object, game.sizeProfile.scoreMultiplier)
  // Larger meals grow the craft more. This follows the new doubled growth
  // cadence while staying bounded enough that one tanker cannot skip a run.
  growBy(game, Math.min(0.16, 0.018 + diameter * 0.016))
  game.absorbedCount += 1
  game.score += reward
  game.pickupPulse = 1
  if (object.kind === 'car') game.destroyedCars.add(object.id)
  if (object.id.startsWith('enemy:')) {
    const enemy = game.enemies.slots.find((candidate) => candidate.id === object.id)
    if (enemy) {
      enemy.respawn = enemy.kind === 'boss' ? 999 : 4.5
      game.enemiesDown += 1
    }
  }
  setMessage(game, 'msgAbsorbedObject', 1.25, reward)
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

function registerImpact(game: GameRuntime, source: 'ENEMY' | 'BUILDING', loss?: SizeLossKind) {
  if (game.damageCooldown > 0 || game.phase !== 'playing') return
  game.damageCooldown = 1.05
  game.impactFlash = 1
  // Replaces the old continuous camera shake: a single short freeze reads as a
  // hit without leaving the whole late game permanently vibrating.
  game.hitstop = HITSTOP_TIME
  shrink(game, source === 'BUILDING' ? 'building' : loss ?? 'contact')
  setMessage(game, 'msgImpact', 1.8)
  tone(source === 'BUILDING' ? 'impact' : 'warning')
  if ('vibrate' in navigator) navigator.vibrate?.([35, 20, 35])
}

function snapshotOf(game: GameRuntime): GameSnapshot {
  const slowdown = Math.max(0, 1 - 1 / (1 + game.ballast * BALLAST_DRAG * 0.13))
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
    daylightLabel: game.daylight.label,
    nightFactor: game.daylight.nightFactor,
    size: game.size,
    sizeRatio: game.sizeProfile.ratio,
    sizeMin: SIZE_MIN,
    sizePulse: game.sizePulse,
    absorbedCount: game.absorbedCount,
    ballast: game.ballast,
    daze: game.daze,
    loadedCars: game.loadedCars,
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
    selectedWeapon: game.selectedWeapon,
    weaponShotsFired: game.weapons.shotsFired,
    activeWeaponProjectiles: activeWeaponProjectileCount(game.weapons),
    activeEnemies: activeEnemyCount(game.enemies),
    enemiesDown: game.enemiesDown,
    beamObjectCount: game.loadedCars,
    message: game.messageTime > 0 ? game.message : '',
    messageKey: game.messageTime > 0 ? game.messageKey : null,
    messageArg: game.messageArg,
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

/**
 * Callouts are stored as a key, not a sentence. The simulation writes what
 * happened; the interface decides what language to say it in.
 */
function setMessage(game: GameRuntime, key: MessageKey, seconds: number, arg = 0) {
  game.messageKey = key
  game.messageArg = arg
  game.message = ''
  game.messageTime = seconds
}

function endRun(game: GameRuntime, title: string, victory: boolean) {
  stopBgm()
  game.phase = 'results'
  game.resultTitle = title
  game.victory = victory
  game.beamActive = false
  game.laserActive = false
  game.message = title
  game.messageKey = null
  game.messageTime = 10
}

export function GameProvider({ children }: { children: ReactNode }) {
  const runtime = useRef(makeRuntime())
  const [snapshot, setSnapshot] = useState(() => snapshotOf(runtime.current))
  const [quality, setQualityState] = useState<RenderQuality>(readStoredQuality)
  const [language, setLanguageState] = useState<Language>(readStoredLanguage)
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
    // A run can end anywhere inside this tick - collapse fires from a hit, not
    // just from the clock - and the next tick returns above before publishing.
    // Without forcing a publish on the transition, whether the results screen
    // appeared at all came down to where the throttle accumulator happened to
    // be. Losing was silently invisible about half the time.
    const phaseAtEntry = game.phase
    if (game.hitstop > 0) {
      // Freeze on real time, not simulation time, so the pause cannot be
      // stretched or skipped by the frame rate.
      game.hitstop = Math.max(0, game.hitstop - dt)
      return
    }
    const d = Math.min(dt, 0.05)
    const input = readInput()
    game.aimX = pointer.current.x
    game.aimY = pointer.current.y
    game.sessionTime += d
    game.remainingTime = Math.max(0, game.remainingTime - d)
    game.messageTime = Math.max(0, game.messageTime - d)
    game.impactFlash = Math.max(0, game.impactFlash - d * 5)
    game.pickupPulse = Math.max(0, game.pickupPulse - d * 3.2)
    game.sizePulse = Math.max(0, game.sizePulse - d * 2.4)
    game.daze = Math.max(0, game.daze - d)
    game.dumpLockout = Math.max(0, game.dumpLockout - d)
    game.timeBonusPulse = Math.max(0, game.timeBonusPulse - d * 2.6)
    game.damageCooldown = Math.max(0, game.damageCooldown - d)
    game.collisionCooldown = Math.max(0, game.collisionCooldown - d)
    game.laserCooldown = Math.max(0, game.laserCooldown - d)
    game.laserFlash = Math.max(0, game.laserFlash - d)
    stepLaserBursts(game.laserBursts, d)
    stepLaserProjectiles(game.laserProjectiles, d)
    // One end condition for the clock. It used to fire here AND again on
    // sessionTime, and since the round length and the target were the same
    // number both hit on the same frame.
    if (game.remainingTime <= 0) {
      endRun(game, 'SURVIVED THE RAID', true)
      updatePilotStatus(game)
      publish()
      return
    }

    const dropPressed = input.drop && !game.dropInputHeld
    game.dropInputHeld = input.drop
    if (dropPressed) {
      dropCars(game)
      game.dumpLockout = DUMP_LOCKOUT
    }
    const turboActive = input.special && game.turbo > 0.02
    if (turboActive) {
      if (game.drone.boostRemaining <= 0) { setMessage(game, 'msgTurbo', 1.2); tone('upgrade') }
      game.turbo = Math.max(0, game.turbo - d * 0.31)
      game.drone.boostRemaining = Math.max(game.drone.boostRemaining, 0.12)
    } else game.turbo = Math.min(1, game.turbo + d * 0.13)

    const flightInput: DroneInput = { ...input, special: false }
    // Only ballast slows the craft. Size is deliberately absent: growth is what
    // the player is good at, and taxing it directly punishes them for winning.
    const stepped = stepDrone(game.drone, flightInput, d, game.ballast * BALLAST_DRAG + (game.daze > 0 ? DAZE_DRAG : 0), UFO_UPGRADES)
    const nextWorld = updateActiveWorld(game.world, stepped.position)
    if (nextWorld !== game.world) {
      game.world = nextWorld
      game.worldColliders = activeWorldColliders(nextWorld)
      game.crowdSpawnZones = crowdSpawnZonesAround(game.drone.position)
      syncBeamObjects(game)
    }
    const collision = collideDrone(stepped, game.worldColliders)
    game.drone = collision.state
    // One sample per tick, written into the runtime's own object so the render
    // layer can read it without sampling again or allocating.
    sampleDaylight(game.sessionTime, game.daylight)
    game.waveStage = waveStageForTime(game.sessionTime)
    if (game.waveStage !== game.pilotPreviousThreat) {
      setBgmWave(game.waveStage)
      game.message = waveLabelForTime(game.sessionTime)
      game.messageKey = null
      game.messageTime = 2.2
      tone('upgrade')
    }
    syncEnemyTiers(game.enemies, game.sessionTime, game.drone.position, game.drone.heading, d)
    syncAntiAirEnemies(game.enemies, game.sessionTime, game.world.buildings)
    stepEnemies(game.enemies, game.drone.position, d)
    syncWeaponTargets(game)
    game.weaponView.position = game.drone.position
    game.weaponView.heading = game.drone.heading
    game.weaponView.pitch = game.drone.pitch
    game.weaponView.targets = game.weaponTargets
    stepWeapons(game.weapons, game.weaponView, d, game.weaponHitHandler)
    if (collision.hit && collision.impulse > 2.5 && game.collisionCooldown <= 0) { game.collisionCooldown = 0.45; registerImpact(game, 'BUILDING') }

    game.beamActive = input.beam
    stepTraffic(game.traffic, { position: game.drone.position, heading: game.drone.heading }, d)
    syncCrowdThreats(game)
    stepCrowds(game.crowds, { position: game.drone.position, heading: game.drone.heading, colliders: game.worldColliders, threats: game.crowdThreats, crowdThreatStart: 1 + game.traffic.cars.length + game.enemies.slots.length, spawnZones: game.crowdSpawnZones }, d)
    const beamField: BeamField = { active: game.beamActive, boosting: turboActive, position: game.drone.position, velocity: game.drone.velocity, radiusScale: game.sizeProfile.beamScale, reachScale: game.sizeProfile.beamReach }
    // No pickup cap: hanging mass is its own limit, and a craft that grabbed
    // too much should feel it rather than be quietly protected from it.
    if (game.beamActive && game.dumpLockout <= 0) {
      for (const car of game.traffic.cars) {
        if (!car.active || !isInsideBeam(car, beamField)) continue
        const captured = captureTrafficCar(game.traffic, car.id)
        if (captured) game.beamObjects.unshift(makeTrafficBeamObject(captured))
      }
    }
    stepHazards(game.hazards, { position: game.drone.position, heading: game.drone.heading, elapsed: game.sessionTime }, d)
    // Suppress the whole field during the lockout, otherwise the dumped load is
    // simply picked straight back up.
    const pullField: BeamField = game.dumpLockout > 0 ? { ...beamField, active: false } : beamField
    stepBeamObjects(game.beamObjects, pullField, d)
    // Crowd movement owns its absorption timer; beam physics only handles the
    // pull so the shrink animation is not advanced twice per frame.
    stepBeamObjects(game.crowds.objects, pullField, d, false)
    stepBeamObjects(game.hazards.objects, pullField, d)
    stepBeamObjects(game.enemies.slots, pullField, d)
    const maxAbsorbDiameter = ufoDiameter(game.size) / 3
    const absorbFrom = (objects: BeamObject[]) => {
      let object = beginNearbyBeamObjectAbsorption(objects, game.drone.position, maxAbsorbDiameter, game.sizeProfile.absorbDistance)
      while (object) {
        triggerLaserBurst(game.laserBursts, 'impact', object.position, object.kind === 'cat' || object.kind === 'pedestrian' ? '#fff06d' : '#6deeff')
        if (object.kind === 'cat' || object.kind === 'pedestrian') absorbCrowd(game, object.kind)
        else absorbBeamObject(game, object)
        object = beginNearbyBeamObjectAbsorption(objects, game.drone.position, maxAbsorbDiameter, game.sizeProfile.absorbDistance)
      }
    }
    absorbFrom(game.crowds.objects)
    absorbFrom(game.beamObjects)
    absorbFrom(game.hazards.objects)
    absorbFrom(game.enemies.slots)
    const detonated = detonateReachedHazard(game.hazards, game.drone.position)
    if (detonated) {
      triggerLaserBurst(game.laserBursts, 'impact', detonated.position, '#ff7a3d')
      shrink(game, 'explosive')
      // Only re-arm from zero: chained dazes would compound into a stun by
      // another name.
      if (game.daze <= 0) game.daze = DAZE_TIME
      game.impactFlash = 1
      setMessage(game, 'msgDetonated', 1.6)
      tone('warning')
    }
    game.loadedCars = loadedCarCount(game)
    game.ballast = beamBallast(game)
    for (let index = game.beamObjects.length - 1; index >= 0; index -= 1) {
      const object = game.beamObjects[index]!
      if (object.active) continue
      if (object.explosionPending) {
        object.explosionPending = false
        triggerLaserBurst(game.laserBursts, 'impact', object.position, '#ff8a45')
      }
      if (object.id.startsWith('traffic:')) releaseTrafficSlot(game.traffic, object.id)
      game.beamObjects.splice(index, 1)
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
      for (const object of game.hazards.objects) {
        if (!object.active || !object.inBeam) continue
        const distance = Math.hypot(object.position.x - game.drone.position.x, object.position.y - game.drone.position.y, object.position.z - game.drone.position.z)
        if (distance < nearest) { nearest = distance; game.beamTargetId = object.id }
      }
      for (const object of game.enemies.slots) {
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
      if (aim.targetKind === 'car' && aim.targetId && destroyCar(game, aim.targetId, direction)) { setMessage(game, 'msgCarLaunched', 0.9) }
      game.laserShotsFired += 1
      tone('pickup')
    }
    game.laserActive = game.laserFlash > 0

    const projectileDamage = stepEnemyProjectiles(game.enemies, game.drone.position, d, game.sizeProfile.hitRadius)
    if (projectileDamage > 0) registerImpact(game, 'ENEMY', game.enemies.lastHitKind ?? 'contact')
    // A bigger craft is a bigger target: the same stream of fire is harder to
    // survive once fat, which is what stops growth from being free.
    const contactDamage = resolveEnemyContacts(game.enemies, game.drone.position, game.sizeProfile.hitRadius)
    if (game.enemies.contactKills > 0) {
      game.enemiesDown += game.enemies.contactKills
      game.score += game.enemies.contactKills * 35
      triggerLaserBurst(game.laserBursts, 'impact', game.enemies.lastContactPoint, '#ff9a3d')
    }
    if (contactDamage > 0) registerImpact(game, 'ENEMY', 'contact')
    updatePilotStatus(game)
    publishAccumulator.current += d
    if (game.phase !== phaseAtEntry || publishAccumulator.current >= 0.06) {
      publishAccumulator.current = 0
      publish()
    }
  }, [publish, readInput])

  const start = useCallback(() => {
    startBgm()
    pointer.current = { x: 0, y: 0 }
    const game = runtime.current
    game.phase = 'playing'
    setMessage(game, 'msgRunStart', 3)
    publish()
  }, [publish])

  const setQuality = useCallback((next: RenderQuality) => {
    setQualityState(next)
    try {
      window.localStorage.setItem(QUALITY_STORAGE_KEY, next)
    } catch {
      // Not being able to remember the choice is not worth failing the toggle.
    }
  }, [])

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    storeLanguage(next)
  }, [])

  const selectWeapon = useCallback((weapon: WeaponId) => {
    const game = runtime.current
    if (game.phase !== 'intro') return
    game.selectedWeapon = weapon
    game.weapons = createWeaponState(weapon)
    publish()
  }, [publish])

  const restart = useCallback(() => {
    startBgm()
    pointer.current = { x: 0, y: 0 }
    runtime.current = makeRuntime(runtime.current.selectedWeapon)
    runtime.current.phase = 'playing'
    runtime.current.message = 'NEW RUN · ABSORB TIME TO SURVIVE'
    runtime.current.messageTime = 3
    publish()
  }, [publish])

  const setMobileInput = useCallback((input: Partial<MobileInput>) => { Object.assign(mobile.current, input) }, [])
  const value = useMemo<GameContextValue>(() => ({ runtime, snapshot, readInput, advance, start, restart, selectWeapon, setMobileInput, quality, setQuality, language, setLanguage, t: STRINGS[language] }), [advance, quality, readInput, restart, selectWeapon, setMobileInput, setQuality, snapshot, start, language, setLanguage])
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGame must be used inside GameProvider')
  return value
}

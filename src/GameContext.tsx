import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { collideDrone, createDroneState, stepDrone, type Aabb, type DroneInput, type DroneState, type Vec3 } from './core/drone'
import {
  type BeamField,
  type BeamObject,
  CAR_MASS,
  absorptionScore,
  beamObjectDiameter,
  beamProfile,
  beginCarDestruction,
  beginNearbyBeamObjectAbsorption,
  isInsideBeam,
  stepBeamObjects,
} from './core/beam'
import { createCrowdState, finishTutorialCrowd, prepareTutorialCrowd, primeCrowds, stepCrowds, type CrowdState } from './core/crowds'
import { type CrowdSpawnZone, canAbsorbBuilding, crowdSpawnZonesAround, destructibleLandmarksAround, nearestDestructibleLandmark, parkingCarsAround, type DestructibleLandmark } from './core/cityLandmarks'
import { STRINGS, readStoredLanguage, storeLanguage, type Language, type MessageKey } from './i18n'
import { createDaylightSample, daylightClock, sampleDaylight, type DaylightSample } from './core/daylight'
import {
  createHazardState,
  detonateReachedHazard,
  destroyHazard,
  stepHazards,
  type HazardState,
} from './core/hazards'
import { SIZE_MIN, SIZE_START, type SizeGainKind, type SizeProfile, clampSize, growSize, growSizeBy, sizeProfile } from './core/size'
import { HEALTH_LOSS, createHealthState, healthRatio, isDead, isRegenerating, stepHealth, type HealthLossKind, type HealthState } from './core/health'
import { BATTLESHIP_TURRETS, activeEnemyCount, battleshipTurretPoint, createEnemyState, hitEnemy, resolveEnemyContacts, stepEnemies, stepEnemyProjectiles, syncAntiAirEnemies, syncEnemyTiers, waveLabelForTime, waveStageForTime, type EnemyState } from './core/enemies'
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
  type ActiveWorld,
  type ProceduralCar,
  WORLD_MAX_CARS,
  WORLD_REMOVE_RADIUS,
  activeWorldColliders,
  buildingBulk,
  buildingMass,
  createActiveWorld,
  lakeDepthAt,
  TUTORIAL_SPAWN,
  updateActiveWorld,
} from './core/world'
import { captureTrafficCar, createTrafficState, primeTraffic, releaseTrafficSlot, stepTraffic, TRAFFIC_MAX_CARS, type TrafficCar, type TrafficState } from './core/traffic'
import { BROADCAST_OPENING_AT, BROADCAST_SECONDS } from './core/broadcast'
import { applyUpgrade, createUpgradeState, isUpgradeDue, rollUpgradeChoices, upgradeBonus, upgradeMultiplier, type UpgradeId, type UpgradeState } from './core/upgrades'
import { createBuildingRuin, damageBuilding, ruinCollider, type BuildingRuin } from './core/buildings'
import { stepLakeAbsorption } from './core/lakes'
import { createMissionState, missionHasQuest, recordMissionEvent, startMissionOne, syncMissionState, type MissionQuest, type MissionState } from './core/missions'
import { absorbShieldDamage, createShieldState, isShieldRegenerating, setShieldCapacity, shieldRatio, stepShield, type ShieldState } from './core/shield'
import { shouldCrashFromOverload } from './core/overload'
import { playLaserSound, startBeamSound, startGameplayMusic, stopBeamSound, stopGameplayMusic, stopLobbyMusic, tone, unlockAudio } from './audio'

export type GamePhase = 'intro' | 'playing' | 'upgrade' | 'results'

// The clock is the round length, not a resource. Absorbing no longer buys time:
// size is the only thing the player is managing, so there is one number to read
// and one way to lose.
/** Five minutes. It was three, which was a number chosen to fit a judging
 *  slot rather than to fit the game. */
export const RUN_SECONDS = 300
export const SURVIVAL_TARGET_TIME = RUN_SECONDS

export type GameRuntime = {
  drone: DroneState
  world: ActiveWorld
  worldColliders: Aabb[]
  sessionTime: number
  /** Same shape as sessionTime but never frozen, including during the
   *  tutorial - the pilot expression hold timer needs a clock that always
   *  moves, or a hit taken before the tutorial's first cat holds the
   *  expression exactly as long as sessionTime stays paused, which is to say
   *  forever. See updatePilotStatus. */
  pilotClock: number
  remainingTime: number
  score: number
  waveStage: number
  /** Which wave bulletin is on air, and for how much longer. The simulation
   *  holds the stage number only - the words are chosen at render time, in
   *  whatever language the player set. */
  broadcastStage: number
  broadcastTime: number
  /** 0 until the load starts to matter, 1 at the point the craft cannot hold
   *  altitude. Drives the visual overload meter. */
  overloadWarn: number
  upgrades: UpgradeState
  /** The opening sighting report is time-triggered rather than raised by a
   *  wave boundary, so it needs its own one-shot latch. */
  openingBroadcastDone: boolean
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
  bossDestroyed: boolean
  beamObjects: BeamObject[]
  crowds: CrowdState
  traffic: TrafficState
  destroyedCars: Set<string>
  /** Buildings the player has eaten. Consulted whenever the city streams, so a
   *  swallowed block does not reappear on the way back. */
  destroyedBuildings: Set<string>
  buildingHealth: Map<string, number>
  ruinedBuildings: Map<string, BuildingRuin>
  destroyedLandmarks: Set<string>
  crowdThreats: Vec3[]
  crowdSpawnZones: CrowdSpawnZone[]
  phase: GamePhase
  message: string
  messageKey: MessageKey | null
  messageArg: number
  messageTime: number
  impactFlash: number
  impactKind: HealthLossKind
  hitstop: number
  size: number
  sizeProfile: SizeProfile
  health: HealthState
  shield: ShieldState
  sizePulse: number
  absorbedCount: number
  ballast: number
  waterAbsorbed: number
  waterAnchored: boolean
  mission: MissionState
  missionPulse: number
  missionBanner: string
  missionBannerTime: number
  checkpoint: Vec3 | null
  checkpointGeneration: number
  missionTarget: Vec3 | null
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
  /** The wave bulletin currently on air, or null when nothing is. */
  broadcastStage: number | null
  broadcastRemaining: number
  /** Cards currently on offer. Empty unless the phase is 'upgrade'. */
  upgradeChoices: UpgradeId[]
  upgradeLevels: Record<UpgradeId, number>
  upgradeNextAt: number
  /** Published so the render layer can size the beam without reaching into
   *  the runtime for the upgrade state. */
  beamRadiusScale: number
  beamReachScale: number
  daylightLabel: string
  daylightClock: string
  nightFactor: number
  size: number
  sizeRatio: number
  sizeMin: number
  overloadWarn: number
  ballastLimit: number
  health: number
  healthMax: number
  healthRatio: number
  regenerating: boolean
  shield: number
  shieldMax: number
  shieldRatio: number
  shieldRegenerating: boolean
  maxAltitude: number
  sizePulse: number
  absorbedCount: number
  ballast: number
  beamStrength: number
  waterAbsorbed: number
  waterAnchored: boolean
  missionStage: number
  missionQuests: MissionQuest[]
  missionPulse: number
  missionBanner: string
  tutorial: boolean
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
  activeEnemies: number
  enemiesDown: number
  /** Battleship health as a fraction, or null when no ship is up. Nobody
   *  keeps shooting something with no visible progress. */
  bossHealth: number | null
  beamObjectCount: number
  message: string
  messageKey: MessageKey | null
  messageArg: number
  impactFlash: number
  impactKind: HealthLossKind
  pickupPulse: number
  timeBonusPulse: number
  timeBonusAmount: number
  resultTitle: string
  victory: boolean
  pilotExpression: PilotExpression
}

export type PlayerInput = DroneInput & { beam: boolean; laser: boolean; laserContinuous?: boolean; drop: boolean }
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
  chooseUpgrade: (id: UpgradeId) => void
  quality: RenderQuality
  setQuality: (quality: RenderQuality) => void
  language: Language
  setLanguage: (language: Language) => void
  t: (typeof STRINGS)[Language]
  setMobileInput: (input: Partial<MobileInput>) => void
}

const GameContext = createContext<GameContextValue | null>(null)
const UFO_UPGRADES = { speed: 0, stability: 0, rack: 0, special: 'none' as const }

const HITSTOP_TIME = 0.05
/**
 * Converts hanging mass into flight load.
 *
 * Cut alongside the mass increase, not left alone. Tripling mass without
 * touching this would have tripled the drag as well, and the point was never
 * to make one car crippling - it was to make one car something you carry for a
 * while. Load per object lands near where it was; the time you spend under it
 * is what grew.
 */
const BALLAST_DRAG = 0.31

/**
 * Hanging mass the craft can still hold altitude against.
 *
 * Past it the beam is carrying more than the engines can lift: climb dies, the
 * craft starts sinking, and touching down while still overloaded ends the run.
 * Weight only slowed you down before, which meant there was no ceiling on greed
 * - a decision needs a limit to be a decision.
 *
 * It is a countdown, not a dead end. Dropping the load with R or finishing the
 * meal both clear it, so the answer is always in the player's hands.
 */
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
    mass: CAR_MASS,
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

function makeRuntime(): GameRuntime {
  const drone = createDroneState()
  // Down in the streets. The opening craft is small, its ceiling is low, and
  // its beam is weak - it belongs among the buildings, not above them.
  drone.position = { ...TUTORIAL_SPAWN }
  drone.heading = Math.PI
  const world = createActiveWorld(drone.position)
  const crowdSpawnZones = crowdSpawnZonesAround(drone.position)
  const crowds = createCrowdState((Math.random() * 0xffffffff) >>> 0)
  prepareTutorialCrowd(crowds, { x: TUTORIAL_SPAWN.x, z: 51 })
  const traffic = createTrafficState((Math.random() * 0xffffffff) >>> 0)
  const enemies = createEnemyState()
  // Populate the first district while the intro is loading. The tutorial cat
  // remains the sole stationary cat, but the rest of city life already exists
  // at a safe distance before the player sees the first rendered frame.
  const openingView = {
    position: drone.position,
    heading: drone.heading,
    colliders: activeWorldColliders(world),
    spawnZones: crowdSpawnZones,
    tutorialCatOnly: true,
  }
  primeTraffic(traffic, openingView)
  primeCrowds(crowds, openingView)
  const crowdThreats = [{ ...drone.position }, ...traffic.cars.map((car) => ({ ...car.position })), ...enemies.slots.map((enemy) => ({ ...enemy.position })), ...crowds.objects.map((object) => ({ ...object.position }))]
  const runtime: GameRuntime = {
    drone,
    world,
    worldColliders: activeWorldColliders(world),
    sessionTime: 0,
    pilotClock: 0,
    remainingTime: RUN_SECONDS,
    score: 0,
    waveStage: 0,
    broadcastStage: 0,
    broadcastTime: 0,
    overloadWarn: 0,
    upgrades: createUpgradeState((Math.random() * 0xffffffff) >>> 0),
    openingBroadcastDone: false,
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
    bossDestroyed: false,
    beamObjects: [...parkingCarsAround(drone.position), ...world.cars].slice(0, WORLD_MAX_CARS).map(makeBeamObject),
    crowds,
    traffic,
    destroyedCars: new Set<string>(),
    destroyedBuildings: new Set<string>(),
    buildingHealth: new Map<string, number>(),
    ruinedBuildings: new Map<string, BuildingRuin>(),
    destroyedLandmarks: new Set<string>(),
    crowdThreats,
    crowdSpawnZones,
    phase: 'intro',
    message: '',
    messageKey: 'msgRunStart',
    messageArg: 0,
    messageTime: 4,
    impactFlash: 0,
    impactKind: 'contact',
    hitstop: 0,
    size: SIZE_START,
    sizeProfile: sizeProfile(SIZE_START),
    health: createHealthState(),
    shield: createShieldState(),
    sizePulse: 0,
    absorbedCount: 0,
    ballast: 0,
    waterAbsorbed: 0,
    waterAnchored: false,
    mission: createMissionState((Math.random() * 0xffffffff) >>> 0),
    missionPulse: 0,
    missionBanner: '',
    missionBannerTime: 0,
    checkpoint: null,
    checkpointGeneration: 0,
    missionTarget: null,
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

function liftLimit(game: GameRuntime) {
  return game.sizeProfile.liftCapacity + upgradeBonus(game.upgrades, 'lift')
}

function beamStrength(game: GameRuntime) {
  return game.sizeProfile.beamStrength + upgradeBonus(game.upgrades, 'beam-grip')
}

function refreshWorldGeometry(game: GameRuntime) {
  game.worldColliders = [
    ...activeWorldColliders(game.world),
    ...[...game.ruinedBuildings.values()]
      .filter((ruin) => Math.hypot(ruin.position.x - game.drone.position.x, ruin.position.z - game.drone.position.z) <= WORLD_REMOVE_RADIUS)
      .map(ruinCollider),
  ]
}

function spawnCheckpoint(game: GameRuntime) {
  game.checkpointGeneration += 1
  const seed = Math.imul(game.checkpointGeneration + game.mission.randomState, 0x45d9f3b) >>> 0
  const angle = seed % 360 / 180 * Math.PI
  const distance = 44 + ((seed >>> 9) % 28)
  game.checkpoint = {
    x: game.drone.position.x + Math.sin(angle) * distance,
    y: Math.max(10, Math.min(game.sizeProfile.maxAltitude - 3, 17 + ((seed >>> 15) % 15))),
    z: game.drone.position.z + Math.cos(angle) * distance,
  }
}

function updateMissionTarget(game: GameRuntime) {
  const targets = [] as DestructibleLandmark[]
  if (missionHasQuest(game.mission, 'destroy-gas-station')) {
    const station = nearestDestructibleLandmark(game.drone.position, 'gas-station', game.destroyedLandmarks)
    if (station) targets.push(station)
  }
  if (missionHasQuest(game.mission, 'destroy-comms')) {
    const communications = nearestDestructibleLandmark(game.drone.position, 'communications', game.destroyedLandmarks)
    if (communications) targets.push(communications)
  }
  targets.sort((left, right) =>
    Math.hypot(left.position.x - game.drone.position.x, left.position.z - game.drone.position.z) -
    Math.hypot(right.position.x - game.drone.position.x, right.position.z - game.drone.position.z),
  )
  game.missionTarget = targets[0] ? { ...targets[0].position } : null
}

function presentMissionChange(game: GameRuntime, previousStage: number, previousRevision: number) {
  if (game.mission.revision === previousRevision) return
  game.missionPulse = 1
  if (game.mission.stage !== previousStage) {
    if (game.mission.stage >= 1 && game.mission.stage <= 3) {
      game.missionBanner = previousStage >= 1
        ? `미션 ${previousStage} 완료 · 미션 ${game.mission.stage}, 골라서 해!`
        : `미션 ${game.mission.stage} 개시 · 골라서 해, 순서는 자유야!`
      game.missionBannerTime = 2.4
    } else if (game.mission.stage === 4) {
      game.missionBanner = '지구 정찰 완료 · 장군님 퇴근 준비 끝!'
      game.missionBannerTime = 4
    }
  }
  if (missionHasQuest(game.mission, 'air-checkpoints') && !game.checkpoint) spawnCheckpoint(game)
  if (!missionHasQuest(game.mission, 'air-checkpoints')) game.checkpoint = null
  if (game.mission.stage === 3 && game.bossDestroyed && missionHasQuest(game.mission, 'destroy-battleship')) {
    recordMissionEvent(game.mission, { type: 'destroy-enemy', kind: 'boss' }, game.sessionTime)
  }
  updateMissionTarget(game)
}

function reportMissionEvent(game: GameRuntime, event: Parameters<typeof recordMissionEvent>[1]) {
  const previousStage = game.mission.stage
  const previousRevision = game.mission.revision
  recordMissionEvent(game.mission, event, game.sessionTime)
  presentMissionChange(game, previousStage, previousRevision)
}

/**
 * Tears a building out of the ground if the craft is big enough to take it.
 *
 * The moment it is caught it leaves the world - out of the render pool, out of
 * the colliders - and becomes an ordinary beam object, so lifting, hanging
 * weight and swallowing all run on the machinery that already exists. Leaving
 * the colliders is also why a building being eaten cannot hurt you: there is
 * nothing left there to fly into.
 */
function grabBuildings(game: GameRuntime, field: BeamField) {
  if (!game.beamActive || game.dumpLockout > 0) return
  const strength = beamStrength(game)
  let taken = false
  for (const building of game.world.buildings) {
    if (game.destroyedBuildings.has(building.id)) continue
    if (!canAbsorbBuilding(building, strength)) continue
    const footprint = {
      position: { x: building.position.x, y: building.position.y, z: building.position.z },
    }
    if (!isInsideBeam(footprint, field)) continue
    game.destroyedBuildings.add(building.id)
    game.beamObjects.unshift({
      id: `building:${building.id}`,
      kind: 'building',
      mass: buildingMass(building),
      diameter: buildingBulk(building),
      color: building.color,
      position: { x: building.position.x, y: building.position.y, z: building.position.z },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0.6, z: 0 },
      scale: { x: building.size.x, y: building.size.y, z: building.size.z },
      facade: building.facade,
      floors: building.floors,
      active: true,
      inBeam: true,
      hold: 1,
      tether: 1,
      playerTouched: true,
      destroying: false,
      destroyTimer: 0,
      explosionPending: false,
      absorbing: false,
      absorbTimer: 0,
      scoreValue: Math.round(240 + buildingMass(building) * 14),
    })
    triggerLaserBurst(game.laserBursts, 'impact', building.position, '#ffd27a')
    tone('impact')
    taken = true
  }
  if (!taken) return
  // Force the city to rebuild without the block that just left it; the normal
  // refresh only fires once the player has moved far enough.
  game.world = updateActiveWorld(game.world, game.drone.position, true, game.destroyedBuildings)
  game.worldColliders = activeWorldColliders(game.world)
}

function syncBeamObjects(game: GameRuntime) {
  const existing = new Map(game.beamObjects.map((object) => [object.id, object]))
  const retained = game.beamObjects.filter((object) => object.active && (object.inBeam || object.tether > 0.02 || object.playerTouched) && Math.hypot(object.position.x - game.drone.position.x, object.position.z - game.drone.position.z) <= WORLD_REMOVE_RADIUS)
  const retainedIds = new Set(retained.map((object) => object.id))
  const sourceCars = [...parkingCarsAround(game.drone.position), ...game.world.cars]
  // Buildings in flight are not sourced from anywhere - they were torn out of
  // the world - so they are retained on their own rather than rebuilt.
  const lifted = retained.filter((object) => object.kind === 'building')
  const nearby = sourceCars.filter((car) => !retainedIds.has(car.id) && !game.destroyedCars.has(car.id)).map((car) => {
    const previous = existing.get(car.id)
    return previous?.active ? previous : makeBeamObject(car)
  })
  const capturedTraffic = retained.filter((object) => object.id.startsWith('traffic:'))
  const parked = [...retained.filter((object) => !object.id.startsWith('traffic:') && object.kind !== 'building'), ...nearby].slice(0, WORLD_MAX_CARS)
  game.beamObjects = [...lifted, ...capturedTraffic.slice(0, TRAFFIC_MAX_CARS), ...parked]
  const retainedTrafficIds = new Set(capturedTraffic.map((object) => object.id))
  for (const car of game.traffic.cars) if (car.captured && !retainedTrafficIds.has(car.id)) releaseTrafficSlot(game.traffic, car.id)
}

function writeLaserSphereTarget(targets: LaserSphereTarget[], slot: number, id: string, center: Vec3, radius: number, explicitKind?: LaserSphereTarget['kind']) {
  const target = targets[slot] ?? { id, kind: 'fighter' as const, center: { x: 0, y: 0, z: 0 }, radius }
  target.id = id
  target.kind = explicitKind ?? (id.startsWith('car:') || id.startsWith('traffic:') || id.startsWith('parking-car:') || id.startsWith('hazard:') ? 'car' : 'fighter')
  target.center.x = center.x
  target.center.y = center.y
  target.center.z = center.z
  target.radius = radius
  targets[slot] = target
  return slot + 1
}

const BATTLESHIP_HIT_POINT: Vec3 = { x: 0, y: 0, z: 0 }

function battleshipHealth(game: GameRuntime) {
  for (const enemy of game.enemies.slots) {
    if (enemy.kind !== 'boss' || !enemy.active) continue
    return Math.max(0, Math.min(1, enemy.hp / enemy.maxHp))
  }
  return null
}

function laserSphereTargets(game: GameRuntime) {
  let slot = 0
  for (const enemy of game.enemies.slots) {
    if (!enemy.active || enemy.absorbing) continue
    if (enemy.kind === 'boss') {
      // The laser only knows how to hit spheres, and the battleship is a
      // seventy-metre slab. One sphere big enough to cover it would swallow
      // half the sky; one sized to the hull's width would only be hittable
      // amidships. A sphere per turret station, all carrying the ship's id,
      // traces the hull instead - so a shot anywhere along the length counts.
      for (let station = 0; station < BATTLESHIP_TURRETS.length; station += 1) {
        battleshipTurretPoint(enemy, station, BATTLESHIP_HIT_POINT)
        slot = writeLaserSphereTarget(game.laserTargets, slot, enemy.id, BATTLESHIP_HIT_POINT, 8)
      }
      continue
    }
    slot = writeLaserSphereTarget(game.laserTargets, slot, enemy.id, enemy.position, enemy.hitRadius)
  }
  for (const object of game.beamObjects) if (object.active && !object.destroying && !object.absorbing) slot = writeLaserSphereTarget(game.laserTargets, slot, object.id, object.position, 1.7)
  for (const car of game.traffic.cars) if (car.active) slot = writeLaserSphereTarget(game.laserTargets, slot, car.id, car.position, 1.7)
  for (const landmark of destructibleLandmarksAround(game.drone.position)) {
    if (game.destroyedLandmarks.has(landmark.id)) continue
    slot = writeLaserSphereTarget(game.laserTargets, slot, landmark.id, landmark.position, landmark.radius, 'landmark')
  }
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
  for (const object of game.crowds.objects) {
    if (!object.active || (!object.inBeam && object.tether <= 0.02)) continue
    if (object.position.y <= 0.72 && object.tether <= 0.02) continue
    mass += object.mass
  }
  for (const object of game.beamObjects) {
    if (!object.active || (!object.inBeam && object.tether <= 0.02)) continue
    if (object.position.y <= 0.72 && object.tether <= 0.02) continue
    mass += object.mass
  }
  for (const hazard of game.hazards.objects) {
    if (!hazard.active || (!hazard.inBeam && hazard.tether <= 0.02)) continue
    if (hazard.position.y <= 1.3 && hazard.tether <= 0.02) continue
    mass += hazard.mass
  }
  for (const enemy of game.enemies.slots) {
    if (!enemy.active || (!enemy.inBeam && enemy.tether <= 0.02)) continue
    if (enemy.position.y <= 0.72 && enemy.tether <= 0.02) continue
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
    hazard.hold = 0
  }
  for (const enemy of game.enemies.slots) {
    if (!enemy.active || (!enemy.inBeam && enemy.tether <= 0.02)) continue
    enemy.inBeam = false
    enemy.tether = 0
    enemy.hold = 0
    dropped += 1
  }
  for (const object of game.beamObjects) {
    if (!object.active || (!object.inBeam && object.tether <= 0.02)) continue
    object.inBeam = false
    object.tether = 0
    object.hold = 0
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

function registerEnemyHit(game: GameRuntime, id: string, damage: number) {
  const result = hitEnemy(game.enemies, id, damage)
  if (result.hit && result.enemy && result.enemy.kind === 'boss') {
    // Sparks where the shot landed, so a hull that takes sixty-four hits still
    // answers each one.
    triggerLaserBurst(game.laserBursts, 'impact', result.enemy.position, '#ffd27a')
  }
  if (!result.destroyed || !result.kind) return
  if (result.kind === 'boss') game.bossDestroyed = true
  if (result.kind === 'boss' && result.enemy) {
    // Seventy-four metres of ship does not go up in one puff. A burst at every
    // gun station breaks along the whole length.
    for (let station = 0; station < BATTLESHIP_TURRETS.length; station += 1) {
      battleshipTurretPoint(result.enemy, station, BATTLESHIP_HIT_POINT)
      triggerLaserBurst(game.laserBursts, 'impact', BATTLESHIP_HIT_POINT, station % 2 === 0 ? '#ff8a45' : '#ffe07a')
    }
    game.impactFlash = 1
  }
  // The ship is worth about two and a half times what it was: it now takes
  // sixty-four laser hits instead of twenty-five, and a reward that did not
  // move with that would make the fight cost more than it pays.
  const reward = result.kind === 'boss' ? 3200 : result.kind === 'tank' ? 260 : result.kind === 'anti-air' ? 180 : result.kind === 'fighter' ? 140 : result.kind === 'helicopter' ? 80 : result.kind === 'police-car' ? 55 : 35
  game.enemiesDown += 1
  game.score += reward
  reportMissionEvent(game, { type: 'destroy-enemy', kind: result.kind })
  setMessage(game, 'msgEnemyDown', 1.4, reward)
  tone('upgrade')
}

function registerEnemyLaserHit(game: GameRuntime, id: string) {
  registerEnemyHit(game, id, upgradeMultiplier(game.upgrades, 'laser-power'))
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
  reportMissionEvent(game, { type: 'destroy-car' })
  return true
}

function destroyHeavyVehicle(game: GameRuntime, id: string) {
  const hazard = game.hazards.objects.find((candidate) => candidate.active && candidate.id === id)
  if (!hazard) return false
  if (hazard.kind === 'explosive') {
    const destroyed = destroyHazard(game.hazards, id)
    if (!destroyed) return false
  } else {
    hazard.active = false
    hazard.inBeam = false
    hazard.tether = 0
    hazard.explosionPending = true
    reportMissionEvent(game, { type: 'destroy-truck' })
  }
  game.score += hazard.kind === 'truck' ? 90 : 140
  triggerLaserBurst(game.laserBursts, 'impact', hazard.position, '#ff8a45')
  return true
}

function registerBuildingLaserHit(game: GameRuntime, id: string) {
  const building = game.world.buildings.find((candidate) => candidate.id === id)
  if (!building || game.destroyedBuildings.has(id)) return false
  const result = damageBuilding(game.buildingHealth, building, upgradeMultiplier(game.upgrades, 'laser-power'))
  triggerLaserBurst(game.laserBursts, 'impact', building.position, '#ffca63')
  if (!result.destroyed) return true
  game.destroyedBuildings.add(building.id)
  game.ruinedBuildings.set(building.id, createBuildingRuin(building))
  game.score += 420
  reportMissionEvent(game, { type: 'ruin-building' })
  game.world = updateActiveWorld(game.world, game.drone.position, true, game.destroyedBuildings)
  refreshWorldGeometry(game)
  game.impactFlash = 1
  return true
}

function detonateLandmark(game: GameRuntime, landmark: DestructibleLandmark) {
  if (game.destroyedLandmarks.has(landmark.id)) return false
  game.destroyedLandmarks.add(landmark.id)
  const point = landmark.position
  for (let burst = 0; burst < 4; burst += 1) {
    triggerLaserBurst(game.laserBursts, 'impact', {
      x: point.x + (burst % 2 ? 3 : -3),
      y: point.y + burst * 1.4,
      z: point.z + (burst < 2 ? -2 : 2),
    }, burst % 2 ? '#ffcf63' : '#ff6a45')
  }
  const knock = (object: BeamObject) => {
    if (!object.active) return
    const dx = object.position.x - point.x
    const dz = object.position.z - point.z
    const distance = Math.hypot(dx, dz)
    if (distance > 28) return
    const force = (1 - distance / 28) * 22
    object.velocity.x += dx / Math.max(1, distance) * force
    object.velocity.y += force * 0.55
    object.velocity.z += dz / Math.max(1, distance) * force
  }
  for (const object of game.beamObjects) knock(object)
  for (const object of game.crowds.objects) knock(object)
  for (const object of game.hazards.objects) knock(object)
  game.score += 650
  reportMissionEvent(game, { type: landmark.kind === 'gas-station' ? 'destroy-gas-station' : 'destroy-comms' })
  updateMissionTarget(game)
  game.impactFlash = 1
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

/**
 * Every point of damage runs through here, so the fail check lives in exactly
 * one place. Size is not touched - it never falls.
 */
function wound(game: GameRuntime, kind: HealthLossKind) {
  game.impactKind = kind
  game.impactFlash = 1
  const hullDamage = absorbShieldDamage(game.shield, HEALTH_LOSS[kind])
  if (hullDamage > 0) {
    game.health.current = Math.max(0, game.health.current - hullDamage)
    game.health.sinceHit = 0
  }
  if (isDead(game.health)) endRun(game, 'CRAFT DOWN', false)
}

/**
 * Called after every absorption. Stops the run dead when a card is due.
 *
 * This fires from the middle of a tick, which is the same shape of bug the
 * results screen had: the next tick returns early on the phase check before it
 * publishes, so without the forced publish on a phase change the card screen
 * would appear or not depending on where the throttle happened to be.
 */
function offerUpgradeIfDue(game: GameRuntime) {
  if (game.phase !== 'playing') return
  if (!isUpgradeDue(game.upgrades, game.absorbedCount)) return
  rollUpgradeChoices(game.upgrades)
  stopBeamSound()
  game.beamActive = false
  game.phase = 'upgrade'
  tone('upgrade')
}

function absorbCrowd(game: GameRuntime, kind: 'cat' | 'pedestrian') {
  const tutorialCat = kind === 'cat' && game.mission.stage === 0
  // Score scales with size, so a big craft earns more per body. Growing is
  // worth chasing beyond simply staying alive.
  const reward = Math.round((kind === 'cat' ? 40 : 15) * game.sizeProfile.scoreMultiplier)
  grow(game, kind)
  game.absorbedCount += 1
  game.score += reward
  game.pickupPulse = 1
  if (tutorialCat) {
    const previousRevision = game.mission.revision
    startMissionOne(game.mission, 0)
    finishTutorialCrowd(game.crowds)
    presentMissionChange(game, 0, previousRevision)
    game.message = '좋아, 고양이는 합격. 이제 도시를 좀 어질러 보자고.'
    game.messageKey = null
    game.messageTime = 2.8
  } else {
    reportMissionEvent(game, { type: kind === 'cat' ? 'capture-cat' : 'capture-person' })
  }
  if (!tutorialCat) setMessage(game, kind === 'cat' ? 'msgAbsorbedCat' : 'msgAbsorbedPerson', 1.25, reward)
  tone('pickup')
  offerUpgradeIfDue(game)
}

function absorbBeamObject(game: GameRuntime, object: BeamObject) {
  const diameter = beamObjectDiameter(object)
  const reward = absorptionScore(object, game.sizeProfile.scoreMultiplier)
  // Larger meals grow the craft more, as a fraction of current size like every
  // other gain. Bounded so no single meal - not even a tower - skips a run.
  growBy(game, Math.min(0.2, 0.012 + diameter * 0.012))
  game.absorbedCount += 1
  game.score += reward
  game.pickupPulse = 1
  offerUpgradeIfDue(game)
  if (object.kind === 'car') game.destroyedCars.add(object.id)
  if (object.kind === 'car') reportMissionEvent(game, { type: 'destroy-car' })
  if (object.kind === 'truck') reportMissionEvent(game, { type: 'destroy-truck' })
  if (object.id.startsWith('enemy:')) {
    const enemy = game.enemies.slots.find((candidate) => candidate.id === object.id)
    if (enemy) {
      enemy.respawn = enemy.kind === 'boss' ? 999 : 4.5
      game.enemiesDown += 1
      reportMissionEvent(game, { type: 'destroy-enemy', kind: enemy.kind })
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

function registerImpact(game: GameRuntime, source: 'ENEMY' | 'BUILDING', loss?: HealthLossKind) {
  if (game.damageCooldown > 0 || game.phase !== 'playing') return
  game.damageCooldown = 1.05
  game.impactFlash = 1
  // Replaces the old continuous camera shake: a single short freeze reads as a
  // hit without leaving the whole late game permanently vibrating.
  game.hitstop = HITSTOP_TIME
  wound(game, source === 'BUILDING' ? 'building' : loss ?? 'contact')
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
    broadcastStage: game.broadcastTime > 0 ? game.broadcastStage : null,
    broadcastRemaining: game.broadcastTime,
    upgradeChoices: game.upgrades.offered,
    upgradeLevels: game.upgrades.levels,
    upgradeNextAt: game.upgrades.nextAt,
    beamRadiusScale: upgradeMultiplier(game.upgrades, 'beam-radius'),
    beamReachScale: 1,
    daylightLabel: game.daylight.label,
    daylightClock: daylightClock(game.sessionTime),
    nightFactor: game.daylight.nightFactor,
    size: game.size,
    sizeRatio: game.sizeProfile.ratio,
    sizeMin: SIZE_MIN,
    overloadWarn: game.overloadWarn,
    ballastLimit: liftLimit(game),
    health: game.health.current,
    healthMax: game.health.max,
    healthRatio: healthRatio(game.health),
    regenerating: isRegenerating(game.health),
    shield: game.shield.current,
    shieldMax: game.shield.max,
    shieldRatio: shieldRatio(game.shield),
    shieldRegenerating: isShieldRegenerating(game.shield),
    maxAltitude: game.sizeProfile.maxAltitude,
    sizePulse: game.sizePulse,
    absorbedCount: game.absorbedCount,
    ballast: game.ballast,
    beamStrength: beamStrength(game),
    waterAbsorbed: game.waterAbsorbed,
    waterAnchored: game.waterAnchored,
    missionStage: game.mission.stage,
    missionQuests: game.mission.quests.map((quest) => ({ ...quest })),
    missionPulse: game.missionPulse,
    missionBanner: game.missionBannerTime > 0 ? game.missionBanner : '',
    tutorial: game.mission.stage === 0,
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
    activeEnemies: activeEnemyCount(game.enemies),
    enemiesDown: game.enemiesDown,
    bossHealth: battleshipHealth(game),
    beamObjectCount: game.loadedCars,
    message: game.messageTime > 0 ? game.message : '',
    messageKey: game.messageTime > 0 ? game.messageKey : null,
    messageArg: game.messageArg,
    impactFlash: game.impactFlash,
    impactKind: game.impactKind,
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
    elapsed: game.pilotClock,
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
  const state = updatePilotExpression({ expression: game.pilotExpression, holdUntil: game.pilotHoldUntil }, next, game.pilotClock)
  game.pilotExpression = state.expression
  game.pilotHoldUntil = state.holdUntil
  game.pilotPreviousCars = game.loadedCars
  game.pilotPreviousThreat = game.waveStage
}

/** Put one wave bulletin on air. There is only ever one band, so raising a
 *  bulletin while another is running replaces it rather than queueing behind
 *  it - the newer wave is the one worth reading about. */
function raiseBroadcast(game: GameRuntime, stage: number) {
  game.broadcastStage = stage
  game.broadcastTime = BROADCAST_SECONDS
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
  stopGameplayMusic()
  stopBeamSound()
  game.phase = 'results'
  game.resultTitle = title
  game.victory = victory
  game.beamActive = false
  game.laserActive = false
  // The run is over; a bulletin about the next wave would be reporting on a
  // city that is no longer under attack.
  game.broadcastTime = 0
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
      // E remains the tractor beam. Holding Q keeps the laser firing on its
      // normal cooldown cadence instead of requiring repeated key presses.
      laser: Boolean(keys.current.KeyQ),
      laserContinuous: Boolean(keys.current.KeyQ),
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
    const rawInput = readInput()
    const tutorialAtStart = game.mission.stage === 0
    // The tutorial teaches one control at a time: until the beam actually
    // lands on the cat, flight, laser, turbo and cargo-drop are all inert, so
    // the only thing left to try is the one the prompt names.
    const input: PlayerInput = tutorialAtStart
      ? { ...rawInput, throttle: 0, strafe: 0, vertical: 0, special: false, laser: false, laserContinuous: false, drop: false }
      : rawInput
    game.aimX = pointer.current.x
    game.aimY = pointer.current.y
    if (!tutorialAtStart) {
      game.sessionTime += d
      game.remainingTime = Math.max(0, game.remainingTime - d)
    }
    game.pilotClock += d
    game.messageTime = Math.max(0, game.messageTime - d)
    game.impactFlash = Math.max(0, game.impactFlash - d * 5)
    game.pickupPulse = Math.max(0, game.pickupPulse - d * 3.2)
    game.missionPulse = Math.max(0, game.missionPulse - d * 3.2)
    game.missionBannerTime = Math.max(0, game.missionBannerTime - d)
    game.sizePulse = Math.max(0, game.sizePulse - d * 2.4)
    game.daze = Math.max(0, game.daze - d)
    game.dumpLockout = Math.max(0, game.dumpLockout - d)
    game.timeBonusPulse = Math.max(0, game.timeBonusPulse - d * 2.6)
    game.damageCooldown = Math.max(0, game.damageCooldown - d)
    game.collisionCooldown = Math.max(0, game.collisionCooldown - d)
    game.laserCooldown = Math.max(0, game.laserCooldown - d)
    game.broadcastTime = Math.max(0, game.broadcastTime - d)
    stepHealth(game.health, d)
    stepShield(game.shield, d)
    // The city reports the sighting once the player has had a moment to fly.
    if (!tutorialAtStart && !game.openingBroadcastDone && game.sessionTime >= BROADCAST_OPENING_AT) {
      game.openingBroadcastDone = true
      raiseBroadcast(game, 0)
    }
    game.laserFlash = Math.max(0, game.laserFlash - d)
    stepLaserBursts(game.laserBursts, d)
    stepLaserProjectiles(game.laserProjectiles, d)
    // One end condition for the clock. It used to fire here AND again on
    // sessionTime, and since the round length and the target were the same
    // number both hit on the same frame.
    if (!tutorialAtStart && game.remainingTime <= 0) {
      const previousStage = game.mission.stage
      const previousRevision = game.mission.revision
      const complete = syncMissionState(game.mission, game.sessionTime, game.score)
      presentMissionChange(game, previousStage, previousRevision)
      endRun(game, complete ? 'EARTH RECON COMPLETE' : 'EARTH WAS WEIRDER THAN EXPECTED', complete)
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
      const duration = 5 + upgradeBonus(game.upgrades, 'turbo-capacity')
      game.turbo = Math.max(0, game.turbo - d / duration)
      game.drone.boostRemaining = Math.max(game.drone.boostRemaining, 0.12)
    } else game.turbo = Math.min(1, game.turbo + d * 0.13 * upgradeMultiplier(game.upgrades, 'turbo-recharge'))

    const flightInput: DroneInput = { ...input, special: false }
    const beamStarted = input.beam && !game.beamActive
    const beamStopped = !input.beam && game.beamActive
    game.beamActive = input.beam
    if (beamStarted) startBeamSound()
    if (beamStopped) stopBeamSound()
    const lake = stepLakeAbsorption(game.waterAbsorbed, d, game.beamActive, lakeDepthAt(game.drone.position))
    game.waterAbsorbed = lake.litres
    game.waterAnchored = lake.anchored
    if (lake.absorbed > 0) reportMissionEvent(game, { type: 'absorb-water', litres: lake.absorbed })
    if (game.waterAnchored) {
      flightInput.throttle *= lake.speedScale
      flightInput.strafe = (flightInput.strafe ?? 0) * lake.speedScale
    }
    // Only ballast slows the craft. Size is deliberately absent: growth is what
    // the player is good at, and taxing it directly punishes them for winning.
    // Soft ceiling. The climb input fades out as the craft nears the height its
    // size allows, so it reads as the air thinning rather than as a wall - a
    // hard clamp would have the craft slamming into an invisible surface.
    const ceiling = game.sizeProfile.maxAltitude
    if (flightInput.vertical > 0) {
      const headroom = Math.max(0, ceiling - game.drone.position.y)
      flightInput.vertical *= Math.min(1, headroom / 9)
    }
    // Overloaded: the engines lose the argument with the load and the craft
    // starts down. Climb is cut rather than reversed - the sinking comes from
    // the flight model's own gravity, so it eases in instead of snapping.
    const capacity = liftLimit(game)
    const overload = Math.max(0, game.ballast - capacity)
    if (overload > 0) {
      flightInput.vertical = Math.min(flightInput.vertical, 0) - Math.min(1, overload / 12)
      if (shouldCrashFromOverload(game.beamActive, game.ballast, capacity, game.drone.position.y)) {
        endRun(game, 'CRUSHED BY THE LOAD', false)
        updatePilotStatus(game)
        publish()
        return
      }
    }
    const warningAt = capacity * 0.6
    game.overloadWarn = game.ballast <= warningAt
      ? 0
      : Math.min(1, (game.ballast - warningAt) / Math.max(1, capacity - warningAt))
    // Keep the visual overload meter, but do not repeat an audio warning.
    const stepped = stepDrone(game.drone, flightInput, d, game.ballast * BALLAST_DRAG + (game.daze > 0 ? DAZE_DRAG : 0), {
      ...UFO_UPGRADES,
      speed: upgradeBonus(game.upgrades, 'speed') / 0.12,
      stability: game.upgrades.levels.turn,
    })
    if (game.waterAnchored) {
      stepped.speed *= lake.speedScale
      stepped.velocity.x *= lake.speedScale
      stepped.velocity.z *= lake.speedScale
    }
    const nextWorld = updateActiveWorld(game.world, stepped.position, false, game.destroyedBuildings)
    if (nextWorld !== game.world) {
      game.world = nextWorld
      refreshWorldGeometry(game)
      game.crowdSpawnZones = crowdSpawnZonesAround(game.drone.position)
      syncBeamObjects(game)
      updateMissionTarget(game)
    }
    const collision = collideDrone(stepped, game.worldColliders)
    game.drone = collision.state
    if (game.checkpoint && Math.hypot(
      game.drone.position.x - game.checkpoint.x,
      game.drone.position.y - game.checkpoint.y,
      game.drone.position.z - game.checkpoint.z,
    ) <= 5) {
      reportMissionEvent(game, { type: 'pass-checkpoint' })
      if (missionHasQuest(game.mission, 'air-checkpoints')) spawnCheckpoint(game)
      else game.checkpoint = null
    }
    // One sample per tick, written into the runtime's own object so the render
    // layer can read it without sampling again or allocating.
    sampleDaylight(game.sessionTime, game.daylight)
    game.waveStage = waveStageForTime(game.sessionTime)
    if (game.waveStage !== game.pilotPreviousThreat) {
      game.message = waveLabelForTime(game.sessionTime)
      game.messageKey = null
      game.messageTime = 2.2
      // The arcade label says the wave changed; the bulletin says what the
      // government just sent. They sit in different places on screen and are
      // meant to be read one after the other.
      raiseBroadcast(game, game.waveStage)
      tone('upgrade')
    }
    if (!tutorialAtStart) {
      syncEnemyTiers(game.enemies, game.sessionTime, game.drone.position, game.drone.heading, d)
      syncAntiAirEnemies(game.enemies, game.sessionTime, game.world.buildings)
    }
    // The craft's velocity goes in with its position: enemies lead the shot,
    // and the lead is computed from how it is actually moving.
    if (!tutorialAtStart) stepEnemies(game.enemies, game.drone.position, d, game.drone.velocity)
    const mineExplosion = game.enemies.mineExplosion
    if (mineExplosion) {
      triggerLaserBurst(game.laserBursts, 'impact', mineExplosion.position, '#ff4f62')
      game.impactFlash = 1
      const distance = Math.hypot(
        mineExplosion.position.x - game.drone.position.x,
        mineExplosion.position.y - game.drone.position.y,
        mineExplosion.position.z - game.drone.position.z,
      )
      if (distance <= mineExplosion.radius) registerImpact(game, 'ENEMY', 'contact')
    }
    if (collision.hit && collision.impulse > 2.5 && game.collisionCooldown <= 0) { game.collisionCooldown = 0.45; registerImpact(game, 'BUILDING') }

    // The opening cat is still the tutorial target, but the city itself does
    // not wait for it: people and moving road traffic are present from frame
    // one rather than materialising only after the first absorption.
    stepTraffic(game.traffic, { position: game.drone.position, heading: game.drone.heading }, d)
    syncCrowdThreats(game)
    stepCrowds(game.crowds, {
      position: game.drone.position,
      heading: game.drone.heading,
      colliders: game.worldColliders,
      threats: game.crowdThreats,
      crowdThreatStart: 1 + game.traffic.cars.length + game.enemies.slots.length,
      spawnZones: game.crowdSpawnZones,
      tutorialCatOnly: tutorialAtStart,
    }, d)
    const beamField: BeamField = {
      active: game.beamActive,
      boosting: turboActive,
      position: game.drone.position,
      velocity: game.drone.velocity,
      // Radius follows the hull and the upgrade multiplies it; reach is
      // upgrade-only now, so a bigger craft gets a wider beam but not a longer
      // one unless it spent a card on length.
      radiusScale: upgradeMultiplier(game.upgrades, 'beam-radius'),
      reachScale: 1,
      // Natural grip from size, multiplied by whatever the player spent cards
      // on. Growing alone makes the beam stronger; cards make it stronger
      // sooner.
      gripStrength: beamStrength(game),
      // So a dropped load lands on the roof it was dropped over rather than
      // falling through it into the street.
      colliders: game.worldColliders,
    }
    if (game.beamActive) {
      for (const landmark of destructibleLandmarksAround(game.drone.position, 1)) {
        if (game.destroyedLandmarks.has(landmark.id)) continue
        const contact = { position: { x: landmark.position.x, y: 0.65, z: landmark.position.z } }
        if (isInsideBeam(contact, beamField)) detonateLandmark(game, landmark)
      }
    }
    // No pickup cap: hanging mass is its own limit, and a craft that grabbed
    // too much should feel it rather than be quietly protected from it.
    if (game.beamActive && game.dumpLockout <= 0) {
      for (const car of game.traffic.cars) {
        if (!car.active || !isInsideBeam(car, beamField)) continue
        const captured = captureTrafficCar(game.traffic, car.id)
        if (captured) game.beamObjects.unshift(makeTrafficBeamObject(captured))
      }
    }
    if (!tutorialAtStart) stepHazards(game.hazards, { position: game.drone.position, heading: game.drone.heading, elapsed: game.sessionTime }, d)
    // Suppress the whole field during the lockout, otherwise the dumped load is
    // simply picked straight back up.
    const pullField: BeamField = game.dumpLockout > 0 ? { ...beamField, active: false } : beamField
    grabBuildings(game, pullField)
    stepBeamObjects(game.beamObjects, pullField, d)
    // Crowd movement owns its absorption timer; beam physics only handles the
    // pull so the shrink animation is not advanced twice per frame.
    stepBeamObjects(game.crowds.objects, pullField, d, false)
    stepBeamObjects(game.hazards.objects, pullField, d)
    stepBeamObjects(game.enemies.slots, pullField, d)
    const maxAbsorbDiameter = Number.POSITIVE_INFINITY
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
      wound(game, 'explosive')
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
    const laserContinuous = Boolean(input.laserContinuous)
    if ((laserPressed || laserContinuous) && game.laserCooldown <= 0) {
      game.laserCooldown = 0.27
      game.laserFlash = 0.12
      const aim = resolveLaserAim({ origin: game.laserAimOrigin, direction: game.laserAimDirection }, game.worldColliders, laserSphereTargets(game))
      const direction = directionToLaserAim(game.drone.position, aim)
      const projectile = fireLaserBeam(game.laserProjectiles, game.drone.position, aim.point)
      triggerLaserBurst(game.laserBursts, 'muzzle', projectile.position)
      if (aim.targetKind) triggerLaserBurst(game.laserBursts, 'impact', aim.point, aim.targetKind === 'car' ? '#ffb24d' : aim.targetKind === 'fighter' ? '#ff557f' : aim.targetKind === 'building' ? '#6deeff' : '#fff0a1')
      if (aim.targetKind === 'fighter' && aim.targetId) registerEnemyLaserHit(game, aim.targetId)
      if (aim.targetKind === 'building' && aim.targetId) registerBuildingLaserHit(game, aim.targetId)
      if (aim.targetKind === 'landmark' && aim.targetId) {
        const landmark = destructibleLandmarksAround(game.drone.position).find((candidate) => candidate.id === aim.targetId)
        if (landmark) detonateLandmark(game, landmark)
      }
      if (aim.targetKind === 'car' && aim.targetId) {
        const destroyed = aim.targetId.startsWith('hazard:')
          ? destroyHeavyVehicle(game, aim.targetId)
          : destroyCar(game, aim.targetId, direction)
        if (destroyed) setMessage(game, 'msgCarLaunched', 0.9)
      }
      game.laserShotsFired += 1
      playLaserSound()
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
    const previousMissionStage = game.mission.stage
    const previousMissionRevision = game.mission.revision
    syncMissionState(game.mission, game.sessionTime, game.score)
    presentMissionChange(game, previousMissionStage, previousMissionRevision)
    updatePilotStatus(game)
    publishAccumulator.current += d
    if (game.phase !== phaseAtEntry || publishAccumulator.current >= 0.06) {
      publishAccumulator.current = 0
      publish()
    }
  }, [publish, readInput])

  const start = useCallback(() => {
    stopBeamSound()
    unlockAudio()
    stopLobbyMusic()
    startGameplayMusic()
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

  const chooseUpgrade = useCallback((id: UpgradeId) => {
    const game = runtime.current
    if (game.phase !== 'upgrade') return
    if (!game.upgrades.offered.includes(id)) return
    applyUpgrade(game.upgrades, id)
    if (id === 'shield') setShieldCapacity(game.shield, game.upgrades.levels.shield)
    game.phase = 'playing'
    tone('pickup')
    publish()
  }, [publish])

  const restart = useCallback(() => {
    stopBeamSound()
    unlockAudio()
    stopLobbyMusic()
    startGameplayMusic()
    pointer.current = { x: 0, y: 0 }
    runtime.current = makeRuntime()
    runtime.current.phase = 'playing'
    runtime.current.message = ''
    runtime.current.messageKey = 'msgRunStart'
    runtime.current.messageTime = 3
    publish()
  }, [publish])

  const setMobileInput = useCallback((input: Partial<MobileInput>) => { Object.assign(mobile.current, input) }, [])
  const value = useMemo<GameContextValue>(() => ({ runtime, snapshot, readInput, advance, start, restart, chooseUpgrade, setMobileInput, quality, setQuality, language, setLanguage, t: STRINGS[language] }), [advance, quality, readInput, restart, chooseUpgrade, setMobileInput, setQuality, snapshot, start, language, setLanguage])
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGame must be used inside GameProvider')
  return value
}

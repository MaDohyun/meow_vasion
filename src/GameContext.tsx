import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { collideDrone, createDroneState, DRONE_DEFAULTS, stepDrone, type Aabb, type DroneInput, type DroneState, type Vec3 } from './core/drone'
import { absoluteAim, dragAim, type AimPoint } from './core/aim'
import {
  type BeamField,
  type BeamObject,
  type BeamWorldProp,
  CAR_MASS,
  absorptionScore,
  beamLiftScale,
  beamObjectDiameter,
  beamProfile,
  beginCarDestruction,
  beginTrashBinLaunch,
  beginNearbyBeamObjectAbsorption,
  isInsideBeam,
  stepBeamObjects,
} from './core/beam'
import { createCrowdState, finishTutorialCrowd, prepareTutorialCrowd, primeCrowds, stepCrowds, type CrowdState } from './core/crowds'
import { type CrowdSpawnZone, GAS_STATION_BEAM_MASS, canAbsorbBuilding, crowdSpawnZonesAround, damageLandmark, destructibleLandmarksAround, nearestDestructibleLandmark, parkingCarsAround, type DestructibleLandmark } from './core/cityLandmarks'
import { STRINGS, readStoredLanguage, storeLanguage, type Language, type MessageKey, type TutorialControl } from './i18n'
import { createDaylightSample, daylightClock, sampleDaylight, type DaylightSample } from './core/daylight'
import {
  createHazardState,
  damageHazard,
  stepHazards,
  type HazardState,
} from './core/hazards'
import { SIZE_MIN, SIZE_START, type SizeGainKind, type SizeProfile, bonusHeartsForSize, clampSize, growSize, growSizeBy, sizeProfile, ufoDiameter } from './core/size'
import { MAX_HEALTH, createHealthState, damageHealth, healHealth, healthRatio, isDead, isRegenerating, raiseHealthMax, stepHealth, type HealthLossKind, type HealthState } from './core/health'
import { BATTLESHIP_TURRETS, activeEnemyCount, battleshipTurretPoint, createEnemyState, hitEnemy, resolveEnemyContacts, stepEnemies, stepEnemyProjectiles, syncAntiAirEnemies, syncEnemyTiers, waveLabelForTime, waveStageForTime, type EnemyKind, type EnemyState } from './core/enemies'
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
import { BLAST_PROFILE, createFireballPool, stepFireballs, triggerFireball, type BlastKind, type Fireball } from './core/fireball'
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
  mysteryCircleAt,
  TUTORIAL_CAT,
  TUTORIAL_SPAWN,
  updateActiveWorld,
} from './core/world'
import { captureTrafficCar, createTrafficState, primeTraffic, releaseTrafficSlot, stepTraffic, TRAFFIC_MAX_CARS, type TrafficCar, type TrafficState } from './core/traffic'
import { BROADCAST_OPENING_AT, BROADCAST_SECONDS } from './core/broadcast'
import {
  BOON_FULL_SCORE,
  BOON_HEAL_PIPS,
  BOON_PICKUP_RADIUS,
  BOON_PICKUP_VERTICAL,
  boonBonus,
  boonHoverY,
  boonMultiplier,
  claimBoon,
  createBoonState,
  type BoonId,
  type BoonState,
} from './core/boons'
import { createBuildingRuin, damageBuilding, ruinCollider, type BuildingRuin } from './core/buildings'
import { stepLakeAbsorption } from './core/lakes'
import { createMissionState, isInsideAirCheckpoint, missionHasQuest, recordMissionEvent, startMissionOne, syncMissionState, type MissionQuest, type MissionState } from './core/missions'
import { MYSTERY_BOOST_DURATION, MYSTERY_BOOST_MAX_MULTIPLIER, mysteryBoostMultiplier } from './core/mysteryCircles'
import { shouldCrashFromOverload } from './core/overload'
import { DRONE_BLAST_TRAUMA, HELICOPTER_RAM_TRAUMA, addShakeTrauma, createShakeState, stepShake, type ShakeState } from './core/shake'
import { worldPropMass, worldPropsAround } from './core/worldProps'
import { endingForTimeUp, isVictory, type RunEnding } from './core/ending'
import { playBoosterSound, playBuildingCollapseSound, playDroneExplosionSound, playLaserSound, playMysteryCircleSound, playNearbyCatCrySound, startBeamSound, startGameplayMusic, stopBeamSound, stopGameplayMusic, stopLobbyMusic, tone, unlockAudio } from './audio'

export type GamePhase = 'intro' | 'playing' | 'results'

export type MissionBanner =
  | { type: 'stage-complete'; previousStage: number; nextStage: number }
  | { type: 'recon-complete' }

// The clock is the round length, not a resource. Absorbing no longer buys time:
// size is the only thing the player is managing, so there is one number to read
// and one way to lose.
/** Five minutes. It was three, which was a number chosen to fit a judging
 *  slot rather than to fit the game. */
export const RUN_SECONDS = 300
/** A laser hit lights a building for about a fifth of a second. */
export const BUILDING_HIT_FLASH_FADE = 5
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
  /** Levels eaten off mystery-circle pickups, plus which circles are spent. */
  boons: BoonState
  /** The opening sighting report is time-triggered rather than raised by a
   *  wave boundary, so it needs its own one-shot latch. */
  openingBroadcastDone: boolean
  loadedCars: number
  damageCooldown: number
  collisionCooldown: number
  catCryCooldown: number
  turbo: number
  /** Draining the gauge to empty forces a short cooldown before it can be
   *  engaged again, even though the gauge itself keeps refilling underneath -
   *  otherwise a full gauge is a straight line to another full drain and the
   *  cost of using it is only ever "wait for the bar." */
  turboLockout: number
  mysteryCircleId: string | null
  /**
   * Every circle this run has flown through, for the radar to grey out.
   *
   * Separate from the mission's own list, which only records a circle while
   * the "pass through different circles" quest is live. Read as a visit log
   * that would be silent for most of a run, and the dial would promise fresh
   * circles the player had already used.
   */
  mysteryCirclesVisited: Set<string>
  mysteryBoostRemaining: number
  mysteryFlash: number
  aimX: number
  aimY: number
  laserAimOrigin: Vec3
  laserAimDirection: Vec3
  beamActive: boolean
  beamTargetId: string | null
  /** Set the moment E is first pressed during the tutorial, and forces the
   *  beam on for the rest of it regardless of the key's actual state. A tap
   *  that releases mid-pull used to let the cat go with whatever swing
   *  velocity it had picked up orbiting the craft, flinging it away and
   *  leaving the tutorial impossible to clear - holding the beam on until
   *  the cat is actually absorbed is the fix. */
  tutorialBeamLatched: boolean
  /**
   * Which controls the general's briefing has handed over, and what the
   * player has done with them.
   *
   * The tutorial teaches one control at a time, and a control it has not
   * reached is inert - see the input gate in advance(). A tap on E before the
   * briefing asks for it used to finish the tutorial in the background and
   * take the ship off mid-sentence; the same is true of every other key now
   * that the briefing asks for them one by one.
   *
   * The `Fired`/`Used` pair are latches rather than live flags. A shot is one
   * frame and the snapshot the briefing reads is published at sixteen hertz,
   * so a live flag is a race; a latch is not.
   */
  tutorialBriefingReady: boolean
  tutorialLaserReady: boolean
  tutorialTurboReady: boolean
  tutorialLaserFired: boolean
  tutorialTurboUsed: boolean
  laserActive: boolean
  laserInputHeld: boolean
  boostInputHeld: boolean
  laserFlash: number
  laserCooldown: number
  laserShotsFired: number
  laserProjectiles: LaserProjectile[]
  laserBursts: LaserBurst[]
  fireballs: Fireball[]
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
  /** Static city dressing that has been absorbed by the tractor beam. */
  destroyedWorldProps: Set<string>
  buildingHealth: Map<string, number>
  /**
   * Buildings currently lit up by a laser hit, keyed by id, 1 down to 0.
   *
   * The hit used to be told entirely on the craft: a tower taking a shot -
   * or coming down - turned the saucer red, which is the same signal the game
   * uses for the player being hurt. It said the wrong thing about who was
   * taking damage. The flash belongs on whatever was shot.
   */
  buildingHitFlash: Map<string, number>
  ruinedBuildings: Map<string, BuildingRuin>
  destroyedLandmarks: Set<string>
  /** Laser damage soaked so far by each still-standing landmark. */
  landmarkHealth: Map<string, number>
  /** Landmarks currently lit by a laser hit, same shape as buildingHitFlash. */
  landmarkHitFlash: Map<string, number>
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
  /** Decaying kick applied to the hull and the camera by a blast. Read
   *  straight off the runtime by the render layer: at 60Hz the throttled
   *  snapshot would sample it about four times over its whole life. */
  shake: ShakeState
  size: number
  sizeProfile: SizeProfile
  health: HealthState
  sizePulse: number
  absorbedCount: number
  ballast: number
  waterAbsorbed: number
  waterAnchored: boolean
  mission: MissionState
  missionPulse: number
  missionBanner: MissionBanner | null
  missionBannerTime: number
  checkpoint: Vec3 | null
  checkpointGeneration: number
  missionTarget: Vec3 | null
  hazards: HazardState
  daze: number
  daylight: DaylightSample
  pickupPulse: number
  timeBonusPulse: number
  timeBonusAmount: number
  resultTitle: string
  victory: boolean
  ending: RunEnding | null
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
  /** Pickup levels, published for the HUD and tests. */
  boonLevels: Record<BoonId, number>
  /** Published so the render layer can size the beam without recomputing the
   *  size profile. */
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
  missionBanner: MissionBanner | null
  tutorial: boolean
  tutorialBriefingReady: boolean
  /** Latched once the player has actually fired / boosted during the
   *  tutorial. The hands-on briefing steps clear on these. */
  tutorialLaserFired: boolean
  tutorialTurboUsed: boolean
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
  ending: RunEnding | null
  pilotExpression: PilotExpression
}

export type PlayerInput = DroneInput & { beam: boolean; laser: boolean; laserContinuous?: boolean }
type MobileInput = PlayerInput & { active: boolean }
export type RenderQuality = 'high' | 'low'

const QUALITY_STORAGE_KEY = 'ufo-attack-quality'

/**
 * HUD surfaces that own the touches landing on them: the movement stick, the
 * altitude arrows, the fire buttons, and every overlay control. A drag that
 * starts on one of these is that control's input, not an aiming swipe.
 */
const HUD_CONTROLS = '.mobile-controls, button, input, select, textarea, label, a'

/**
 * Mirrors the query that reveals `.mobile-controls` in styles.css. The drag
 * reticle is part of that control scheme, so it turns up exactly where the
 * stick and the fire buttons do; a desktop that happens to have a touchscreen
 * keeps the cursor mapping for its taps.
 */
const TOUCH_CONTROL_QUERY = '(pointer: coarse), (max-width: 760px)'

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
  unlockTutorialControl: (control: TutorialControl) => void
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
const CAT_CRY_HEAR_DISTANCE = 18
const CAT_CRY_INTERVAL = 4.5
/** Which callout each pickup raises. The words live in i18n like every other
 *  mid-run message. */
const BOON_MESSAGE_KEY: Record<BoonId, MessageKey> = {
  'laser-power': 'msgBoonLaser',
  speed: 'msgBoonSpeed',
  'turbo-recharge': 'msgBoonTurboRecharge',
  'turbo-capacity': 'msgBoonTurboCapacity',
}
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

const WORLD_PROP_COLORS: Record<BeamWorldProp['kind'], string> = {
  'rooftop-structure': '#aeb5b8',
  tree: '#6e914b',
  'utility-pole': '#aeb5b8',
  'power-pylon': '#aeb5b8',
  communications: '#d7d1c5',
  'trash-bin': '#079b8d',
  'park-bench': '#c58b68',
  'bus-stop': '#78aebc',
  subway: '#78aebc',
}

const WORLD_PROP_DIAMETERS: Record<BeamWorldProp['kind'], number> = {
  'rooftop-structure': 6.2,
  tree: 4.4,
  'utility-pole': 2.8,
  'power-pylon': 7.2,
  communications: 12,
  'trash-bin': 1.7,
  'park-bench': 3.4,
  'bus-stop': 7.2,
  subway: 8.6,
}

const WORLD_PROP_SCORES: Record<BeamWorldProp['kind'], number> = {
  'rooftop-structure': 110,
  tree: 65,
  'utility-pole': 45,
  'power-pylon': 180,
  communications: 520,
  'trash-bin': 30,
  'park-bench': 35,
  'bus-stop': 140,
  subway: 220,
}

function makeWorldPropBeamObject(worldProp: BeamWorldProp): BeamObject {
  return {
    id: worldProp.id,
    kind: worldProp.kind,
    mass: worldPropMass(worldProp),
    color: WORLD_PROP_COLORS[worldProp.kind],
    position: { ...worldProp.position },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: worldProp.rotation, z: 0 },
    angularVelocity: { x: 0, y: 0.6, z: 0 },
    scale: { ...worldProp.scale },
    active: true,
    inBeam: false,
    tether: 0,
    playerTouched: false,
    destroying: false,
    destroyTimer: 0,
    explosionPending: false,
    absorbing: false,
    absorbTimer: 0,
    diameter: WORLD_PROP_DIAMETERS[worldProp.kind],
    scoreValue: WORLD_PROP_SCORES[worldProp.kind],
    // Scenery until something moves it. Falling props were settling a fraction
    // of a metre onto the physics floor the moment they streamed in, which is
    // invisible on its own but means "off its spot" - the test the render layer
    // uses to decide whether the world or the beam owns a prop - was true for
    // every prop in the city. stepBeamObjects turns this on the first time the
    // beam actually lifts it.
    freePhysics: false,
    worldProp,
  }
}

/**
 * Which blast a downed enemy leaves, if any.
 *
 * Every remaining enemy is a machine, but the scale of its blast still follows
 * its silhouette so a mine pop cannot read like the battleship going up.
 */
const ENEMY_BLAST: Partial<Record<EnemyKind, BlastKind>> = {
  drone: 'aircraft',
  helicopter: 'aircraft',
  fighter: 'aircraft',
  'anti-air': 'vehicle',
  boss: 'landmark',
}

/** Varies one blast from the next without the caller having to carry a
 *  counter. The clock is fine: two blasts in the same frame are the same
 *  explosion as far as the eye is concerned. */
function blastSeed(game: GameRuntime) {
  return Math.round(game.sessionTime * 60) + game.laserShotsFired
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
  prepareTutorialCrowd(crowds, TUTORIAL_CAT)
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
    boons: createBoonState(),
    openingBroadcastDone: false,
    loadedCars: 0,
    damageCooldown: 0,
    collisionCooldown: 0,
    // Let the lobby start cue finish before the first proximity call when the
    // tutorial cat is already beneath the opening craft.
    catCryCooldown: 1.8,
    turbo: 1,
    turboLockout: 0,
    mysteryCircleId: null,
    mysteryCirclesVisited: new Set<string>(),
    mysteryBoostRemaining: 0,
    mysteryFlash: 0,
    aimX: 0,
    aimY: 0,
    laserAimOrigin: { ...drone.position },
    laserAimDirection: laserDirection(drone.heading, drone.pitch),
    beamActive: false,
    beamTargetId: null,
    tutorialBeamLatched: false,
    tutorialBriefingReady: false,
    tutorialLaserReady: false,
    tutorialTurboReady: false,
    tutorialLaserFired: false,
    tutorialTurboUsed: false,
    laserActive: false,
    laserInputHeld: false,
    boostInputHeld: false,
    laserFlash: 0,
    laserCooldown: 0,
    laserShotsFired: 0,
    laserProjectiles: createLaserPool(),
    laserBursts: createLaserBurstPool(),
    fireballs: createFireballPool(),
    laserTargets: [],
    enemies,
    enemiesDown: 0,
    bossDestroyed: false,
    beamObjects: [...parkingCarsAround(drone.position), ...world.cars].slice(0, WORLD_MAX_CARS).map(makeBeamObject),
    crowds,
    traffic,
    destroyedCars: new Set<string>(),
    destroyedBuildings: new Set<string>(),
    destroyedWorldProps: new Set<string>(),
    buildingHealth: new Map<string, number>(),
    buildingHitFlash: new Map<string, number>(),
    ruinedBuildings: new Map<string, BuildingRuin>(),
    destroyedLandmarks: new Set<string>(),
    landmarkHealth: new Map<string, number>(),
    landmarkHitFlash: new Map<string, number>(),
    crowdThreats,
    crowdSpawnZones,
    phase: 'intro',
    message: '',
    messageKey: null,
    messageArg: 0,
    messageTime: 0,
    impactFlash: 0,
    impactKind: 'contact',
    hitstop: 0,
    shake: createShakeState(),
    size: SIZE_START,
    sizeProfile: sizeProfile(SIZE_START),
    health: createHealthState(),
    sizePulse: 0,
    absorbedCount: 0,
    ballast: 0,
    waterAbsorbed: 0,
    waterAnchored: false,
    mission: createMissionState((Math.random() * 0xffffffff) >>> 0),
    missionPulse: 0,
    missionBanner: null,
    missionBannerTime: 0,
    checkpoint: null,
    checkpointGeneration: 0,
    missionTarget: null,
    hazards: createHazardState(),
    daze: 0,
    daylight: createDaylightSample(),
    pickupPulse: 0,
    timeBonusPulse: 0,
    timeBonusAmount: 0,
    resultTitle: '',
    victory: false,
    ending: null,
    pilotExpression: 'normal',
    pilotHoldUntil: 0,
    pilotPreviousCars: 0,
    pilotPreviousThreat: 0,
  }
  syncBeamObjects(runtime)
  return runtime
}

/** Hanging weight the craft can hold. Pure size now - the lift cards are
 *  gone, so growing is the one way to carry more. */
function liftLimit(game: GameRuntime) {
  return game.sizeProfile.liftCapacity
}

/** The integer grip rung. Pure size as well: 1 at the opening saucer, 12 at
 *  the ceiling, and the whole weight ladder hangs off it. */
function beamStrength(game: GameRuntime) {
  return game.sizeProfile.beamStrength
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
    // The tutorial's own hand-off to mission 1 is narrated by the general's
    // briefing instead, so this banner only fires between real missions.
    if (previousStage >= 1 && game.mission.stage >= 1 && game.mission.stage <= 3) {
      game.missionBanner = {
        type: 'stage-complete',
        previousStage,
        nextStage: game.mission.stage,
      }
      game.missionBannerTime = 4.4
    } else if (game.mission.stage === 4) {
      game.missionBanner = { type: 'recon-complete' }
      game.missionBannerTime = 6
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

function removeRooftopProp(game: GameRuntime, buildingId: string) {
  game.destroyedWorldProps.add(`roof:${buildingId}`)
  for (const object of game.beamObjects) {
    if (object.worldProp?.buildingId !== buildingId) continue
    object.active = false
    object.inBeam = false
    object.tether = 0
    object.absorbing = false
  }
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
  if (!game.beamActive) return
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
    removeRooftopProp(game, building.id)
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
  const sourceProps = worldPropsAround(game.world, game.drone.position)
    .filter((prop) => !game.destroyedWorldProps.has(prop.id))
    .filter((prop) => prop.kind !== 'communications' || !game.destroyedLandmarks.has(prop.id))
  // Buildings in flight are not sourced from anywhere - they were torn out of
  // the world - so they are retained on their own rather than rebuilt.
  const lifted = retained.filter((object) => object.kind === 'building')
  const carriedProps = retained.filter((object) => object.worldProp)
  const nearby = sourceCars.filter((car) => !retainedIds.has(car.id) && !game.destroyedCars.has(car.id)).map((car) => {
    const previous = existing.get(car.id)
    return previous?.active ? previous : makeBeamObject(car)
  })
  const nearbyProps = sourceProps.filter((prop) => !retainedIds.has(prop.id)).map((prop) => {
    const previous = existing.get(prop.id)
    return previous?.active ? previous : makeWorldPropBeamObject(prop)
  })
  const capturedTraffic = retained.filter((object) => object.id.startsWith('traffic:'))
  const parked = retained.filter((object) => !object.id.startsWith('traffic:') && object.kind !== 'building' && !object.worldProp)
  const cars = [...parked, ...nearby].slice(0, WORLD_MAX_CARS)
  game.beamObjects = [...lifted, ...carriedProps, ...capturedTraffic.slice(0, TRAFFIC_MAX_CARS), ...cars, ...nearbyProps]
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

/**
 * Street furniture the laser may clear, with the hit sphere lifted to the part
 * of the silhouette the player actually aims at - a sphere at a lamp's base
 * would sit under the lamp head and every shot at the light would miss. The
 * big infrastructure keeps its own rules: rooftop kit hides behind building
 * colliders, and pylons and comms masts stay beam-and-landmark business.
 */
const LASERABLE_PROPS: Partial<Record<BeamWorldProp['kind'], { centerY: number; radius: number }>> = {
  'utility-pole': { centerY: 2.2, radius: 2.5 },
  'trash-bin': { centerY: 0.7, radius: 1.1 },
  'park-bench': { centerY: 0.5, radius: 1.7 },
  'bus-stop': { centerY: 1.5, radius: 3 },
  tree: { centerY: 2, radius: 2.3 },
}
const PROP_HIT_POINT: Vec3 = { x: 0, y: 0, z: 0 }

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
  // Street furniture is fair game for the laser now, but only the kinds in
  // LASERABLE_PROPS - each with a sphere sized and centred to its silhouette,
  // so a listed prop is a prop the shot genuinely demolishes.
  for (const object of game.beamObjects) {
    if (!object.active || object.destroying || object.absorbing) continue
    if (object.worldProp) {
      const profile = LASERABLE_PROPS[object.worldProp.kind]
      if (!profile) continue
      PROP_HIT_POINT.x = object.position.x
      PROP_HIT_POINT.y = object.position.y + profile.centerY
      PROP_HIT_POINT.z = object.position.z
      slot = writeLaserSphereTarget(game.laserTargets, slot, object.id, PROP_HIT_POINT, profile.radius, 'prop')
      continue
    }
    slot = writeLaserSphereTarget(game.laserTargets, slot, object.id, object.position, 1.7)
  }
  // People are targets; cats never are - they are crew to rescue, not prey.
  for (const person of game.crowds.objects) {
    if (!person.active || person.absorbing || person.kind === 'cat') continue
    slot = writeLaserSphereTarget(game.laserTargets, slot, person.id, person.position, 0.75, 'person')
  }
  for (const car of game.traffic.cars) if (car.active) slot = writeLaserSphereTarget(game.laserTargets, slot, car.id, car.position, 1.7)
  // Heavy vehicles are laser targets like any other road traffic - the sphere
  // is sized to their bulk so a shot that visibly lands on one counts.
  for (const hazard of game.hazards.objects) {
    if (!hazard.active || hazard.absorbing) continue
    slot = writeLaserSphereTarget(game.laserTargets, slot, hazard.id, hazard.position, beamObjectDiameter(hazard) * 0.45)
  }
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
    if (!object.active || object.tether <= 0.02) continue
    mass += object.mass
  }
  for (const object of game.beamObjects) {
    if (!object.active || object.tether <= 0.02) continue
    mass += object.mass
  }
  for (const hazard of game.hazards.objects) {
    if (!hazard.active || hazard.tether <= 0.02) continue
    mass += hazard.mass
  }
  for (const enemy of game.enemies.slots) {
    if (!enemy.active || enemy.tether <= 0.02) continue
    mass += enemy.mass
  }
  return mass
}

function loadedCarCount(game: GameRuntime) {
  let count = 0
  for (const object of game.beamObjects) if (object.active && object.tether > 0.02) count += 1
  for (const object of game.crowds.objects) if (object.active && object.tether > 0.02) count += 1
  for (const object of game.hazards.objects) if (object.active && object.tether > 0.02) count += 1
  for (const object of game.enemies.slots) if (object.active && object.tether > 0.02) count += 1
  return count
}

function registerEnemyHit(game: GameRuntime, id: string, damage: number) {
  const result = hitEnemy(game.enemies, id, damage)
  if (result.hit && result.enemy && result.enemy.kind === 'boss') {
    // Sparks where the shot landed, so a hull that takes sixty-four hits still
    // answers each one.
    triggerLaserBurst(game.laserBursts, 'impact', result.enemy.position, '#ffd27a')
  }
  if (!result.destroyed || !result.kind) return
  if (result.kind === 'drone') playDroneExplosionSound()
  if (result.kind === 'boss') game.bossDestroyed = true
  if (result.kind === 'boss' && result.enemy) {
    // Seventy-four metres of ship does not go up in one puff. A burst at every
    // gun station breaks along the whole length.
    for (let station = 0; station < BATTLESHIP_TURRETS.length; station += 1) {
      battleshipTurretPoint(result.enemy, station, BATTLESHIP_HIT_POINT)
      triggerLaserBurst(game.laserBursts, 'impact', BATTLESHIP_HIT_POINT, station % 2 === 0 ? '#ff8a45' : '#ffe07a')
    }
  }
  // A mine, helicopter or fighter leaves a blast sized to the machine.
  if (result.enemy && ENEMY_BLAST[result.kind]) {
    triggerFireball(game.fireballs, ENEMY_BLAST[result.kind]!, result.enemy.position, undefined, blastSeed(game))
  }
  // The ship is worth about two and a half times what it was: it now takes
  // sixty-four laser hits instead of twenty-five, and a reward that did not
  // move with that would make the fight cost more than it pays.
  const reward = result.kind === 'boss' ? 3200 : result.kind === 'anti-air' ? 180 : result.kind === 'fighter' ? 140 : result.kind === 'helicopter' ? 80 : 35
  game.enemiesDown += 1
  game.score += reward
  reportMissionEvent(game, { type: 'destroy-enemy', kind: result.kind })
  setMessage(game, 'msgEnemyDown', 1.4, reward)
  tone('upgrade')
}

function registerEnemyLaserHit(game: GameRuntime, id: string) {
  registerEnemyHit(game, id, boonMultiplier(game.boons, 'laser-power'))
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

/**
 * A laser hit on a truck or tanker, run like a building hit: every shot lands
 * with a blast off the bodywork, and the vehicle only goes up once its hit
 * points are spent. Returns true on the killing hit.
 */
function registerHeavyVehicleLaserHit(game: GameRuntime, id: string) {
  const result = damageHazard(game.hazards, id, boonMultiplier(game.boons, 'laser-power'))
  if (!result) return false
  triggerLaserBurst(game.laserBursts, 'impact', result.hazard.position, '#ff8a45')
  if (!result.destroyed) {
    triggerFireball(game.fireballs, 'strike', result.hazard.position, undefined, blastSeed(game))
    return false
  }
  game.score += result.hazard.kind === 'truck' ? 90 : 140
  reportMissionEvent(game, { type: result.hazard.kind === 'truck' ? 'destroy-truck' : 'destroy-tanker' })
  triggerFireball(game.fireballs, 'vehicle', result.hazard.position, undefined, blastSeed(game))
  return true
}

/**
 * A pedestrian shot from range simply drops: no sample banked, so no growth
 * and no capture credit, only a token score. Cats are never listed as laser
 * spheres; the guard here is the belt to that brace.
 */
function registerPersonLaserHit(game: GameRuntime, id: string) {
  const person = game.crowds.objects.find((candidate) => candidate.active && candidate.id === id)
  if (!person || person.kind === 'cat' || person.absorbing) return false
  person.active = false
  person.inBeam = false
  person.tether = 0
  game.score += 15
  triggerLaserBurst(game.laserBursts, 'impact', person.position, '#fff06d')
  return true
}

/**
 * Street furniture shot from range is demolished, not collected: the prop
 * leaves the world for good, but earns no absorb credit and feeds no absorb
 * mission - the beam is still the only way to bank a sample.
 */
function registerPropLaserHit(game: GameRuntime, id: string, direction: Vec3) {
  const object = game.beamObjects.find((candidate) => candidate.active && candidate.id === id)
  if (!object?.worldProp || object.absorbing) return false
  // A bin is litter, not ordnance: instead of popping in a fireball it goes
  // flying along the shot, spraying its contents as it tumbles - the litter
  // fleck pool follows any launched bin. Its spot never refills either way.
  if (object.worldProp.kind === 'trash-bin' && beginTrashBinLaunch(object, direction, game.drone.velocity)) {
    game.destroyedWorldProps.add(object.worldProp.id)
    game.score += 30
    triggerLaserBurst(game.laserBursts, 'impact', object.position, '#c9d18a')
    return true
  }
  object.active = false
  object.inBeam = false
  object.tether = 0
  game.destroyedWorldProps.add(object.worldProp.id)
  game.score += 20
  const blastPoint = { x: object.position.x, y: object.position.y + 0.9, z: object.position.z }
  triggerLaserBurst(game.laserBursts, 'impact', blastPoint, '#9be8ff')
  triggerFireball(game.fireballs, 'vehicle', blastPoint, undefined, blastSeed(game))
  return true
}

function registerBuildingLaserHit(game: GameRuntime, id: string) {
  const building = game.world.buildings.find((candidate) => candidate.id === id)
  if (!building || game.destroyedBuildings.has(id)) return false
  const result = damageBuilding(game.buildingHealth, building, boonMultiplier(game.boons, 'laser-power'))
  game.buildingHitFlash.set(building.id, 1)
  triggerLaserBurst(game.laserBursts, 'impact', building.position, '#ffca63')
  if (!result.destroyed) return true
  playBuildingCollapseSound()
  // A tower's own blast is centred on the tower, not on the point that was
  // shot: it is the whole thing failing, not the last hit landing.
  triggerFireball(game.fireballs, 'ruin', {
    x: building.position.x,
    y: building.position.y + building.size.y * 0.28,
    z: building.position.z,
  }, Math.min(BLAST_PROFILE.landmark.radius, Math.max(building.size.x, building.size.z) * 0.6), blastSeed(game))
  game.destroyedBuildings.add(building.id)
  removeRooftopProp(game, building.id)
  game.ruinedBuildings.set(building.id, createBuildingRuin(building))
  game.score += 420
  reportMissionEvent(game, { type: 'ruin-building' })
  game.world = updateActiveWorld(game.world, game.drone.position, true, game.destroyedBuildings)
  refreshWorldGeometry(game)
  game.buildingHitFlash.delete(building.id)
  return true
}

function detonateLandmark(game: GameRuntime, landmark: DestructibleLandmark) {
  if (game.destroyedLandmarks.has(landmark.id)) return false
  game.destroyedLandmarks.add(landmark.id)
  game.landmarkHealth.delete(landmark.id)
  game.landmarkHitFlash.delete(landmark.id)
  const point = landmark.position
  for (let burst = 0; burst < 4; burst += 1) {
    triggerLaserBurst(game.laserBursts, 'impact', {
      x: point.x + (burst % 2 ? 3 : -3),
      y: point.y + burst * 1.4,
      z: point.z + (burst < 2 ? -2 : 2),
    }, burst % 2 ? '#ffcf63' : '#ff6a45')
  }
  triggerFireball(game.fireballs, 'landmark', { x: point.x, y: point.y + 3, z: point.z }, undefined, blastSeed(game))
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
  // A gas station going up is score and spectacle only - the mission board no
  // longer asks for one - while a comms mast still counts toward its hunt.
  if (landmark.kind !== 'gas-station') reportMissionEvent(game, { type: 'destroy-comms' })
  updateMissionTarget(game)
  return true
}

function grow(game: GameRuntime, kind: SizeGainKind) {
  const before = game.size
  game.size = growSize(game.size, kind)
  game.sizeProfile = sizeProfile(game.size)
  game.sizePulse = 1
  raiseHealthMax(game.health, MAX_HEALTH + bonusHeartsForSize(game.size))
  return game.size - before
}

function growBy(game: GameRuntime, amount: number) {
  const before = game.size
  game.size = growSizeBy(game.size, amount)
  game.sizeProfile = sizeProfile(game.size)
  game.sizePulse = 1
  raiseHealthMax(game.health, MAX_HEALTH + bonusHeartsForSize(game.size))
  return game.size - before
}

/**
 * Every point of damage runs through here, so the fail check lives in exactly
 * one place. Size is not touched - it never falls.
 */
function wound(game: GameRuntime, kind: HealthLossKind) {
  game.impactKind = kind
  game.impactFlash = 1
  damageHealth(game.health, kind)
  if (isDead(game.health)) endRun(game, 'CRAFT DOWN', 'downed')
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
    // No hud-center flavor text here - the general's briefing (BossBriefing)
    // covers the tutorial hand-off with its own step 6/7 lines.
  } else {
    reportMissionEvent(game, { type: kind === 'cat' ? 'capture-cat' : 'capture-person' })
  }
  if (!tutorialCat) setMessage(game, kind === 'cat' ? 'msgAbsorbedCat' : 'msgAbsorbedPerson', 1.25, reward)
  tone('pickup')
}

function absorbBeamObject(game: GameRuntime, object: BeamObject) {
  const diameter = beamObjectDiameter(object)
  const reward = absorptionScore(object, game.sizeProfile.scoreMultiplier)
  if (object.worldProp) {
    game.destroyedWorldProps.add(object.worldProp.id)
    if (object.worldProp.kind === 'communications') game.destroyedLandmarks.add(object.worldProp.id)
  }
  // Larger meals grow the craft more, as a fraction of current size like every
  // other gain. Bounded so no single meal - not even a tower - skips a run.
  growBy(game, Math.min(0.2, 0.012 + diameter * 0.012))
  game.absorbedCount += 1
  game.score += reward
  game.pickupPulse = 1
  if (object.kind === 'car') game.destroyedCars.add(object.id)
  if (object.kind === 'car') reportMissionEvent(game, { type: 'destroy-car' })
  if (object.kind === 'truck') reportMissionEvent(game, { type: 'destroy-truck' })
  // Swallowing a tanker whole removes it as surely as shooting it, so the
  // hunt counts both - same rule the truck quest already follows.
  if (object.kind === 'explosive') reportMissionEvent(game, { type: 'destroy-tanker' })
  if (object.kind === 'rooftop-structure') reportMissionEvent(game, { type: 'absorb-rooftop-structure' })
  if (object.worldProp?.kind === 'tree') reportMissionEvent(game, { type: 'absorb-tree' })
  if (object.worldProp?.kind === 'utility-pole') reportMissionEvent(game, { type: 'absorb-streetlight' })
  // Carrying a mast off cuts communications exactly as surely as shooting it
  // down, and it is now the only way the beam can take one - so the mission
  // has to count it, and the marker has to move on to the next mast.
  if (object.worldProp?.kind === 'communications') {
    reportMissionEvent(game, { type: 'destroy-comms' })
    updateMissionTarget(game)
  }
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

function updateNearbyCatCry(game: GameRuntime, dt: number) {
  game.catCryCooldown = Math.max(0, game.catCryCooldown - dt)
  if (game.catCryCooldown > 0) return
  let nearest = Number.POSITIVE_INFINITY
  for (const object of game.crowds.objects) {
    if (!object.active || object.kind !== 'cat' || object.absorbing || object.inBeam) continue
    const distance = Math.hypot(
      object.position.x - game.drone.position.x,
      object.position.y - game.drone.position.y,
      object.position.z - game.drone.position.z,
    )
    if (distance < nearest) nearest = distance
  }
  if (nearest > CAT_CRY_HEAR_DISTANCE) return
  playNearbyCatCrySound(1 - nearest / CAT_CRY_HEAR_DISTANCE)
  game.catCryCooldown = CAT_CRY_INTERVAL
}

/**
 * `trauma` is the blast shake, and only explosive hits pass one: a scrape
 * along a tower still reads as the freeze alone. It is spent here rather than
 * at the call site so a hit swallowed by the damage cooldown shakes nothing -
 * that is not a hit the player took.
 */
function registerImpact(game: GameRuntime, source: 'ENEMY' | 'BUILDING', loss?: HealthLossKind, trauma = 0) {
  if (game.damageCooldown > 0 || game.phase !== 'playing') return
  game.damageCooldown = 1.05
  game.impactFlash = 1
  // Replaces the old continuous camera shake: a single short freeze reads as a
  // hit without leaving the whole late game permanently vibrating. A blast
  // adds its own decaying kick on top of the freeze - see core/shake.
  game.hitstop = HITSTOP_TIME
  if (trauma > 0) addShakeTrauma(game.shake, trauma)
  wound(game, source === 'BUILDING' ? 'building' : loss ?? 'contact')
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
    boonLevels: game.boons.levels,
    beamRadiusScale: game.sizeProfile.beamScale,
    beamReachScale: game.sizeProfile.beamReach,
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
    missionBanner: game.missionBannerTime > 0 ? game.missionBanner : null,
    tutorial: game.mission.stage === 0,
    tutorialBriefingReady: game.tutorialBriefingReady,
    tutorialLaserFired: game.tutorialLaserFired,
    tutorialTurboUsed: game.tutorialTurboUsed,
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
    ending: game.ending,
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

function endRun(game: GameRuntime, title: string, ending: RunEnding) {
  stopGameplayMusic()
  stopBeamSound()
  game.phase = 'results'
  game.resultTitle = title
  game.ending = ending
  game.victory = isVictory(ending)
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
  const pointer = useRef<AimPoint>({ x: 0, y: 0 })
  // The finger that currently owns the reticle, and where it last was. Null
  // whenever no drag is in flight, which is most of the time on a phone.
  const touchAim = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const mobile = useRef<MobileInput>({ throttle: 0, steer: 0, strafe: 0, lookPitch: 0, vertical: 0, special: false, beam: false, laser: false, active: false })
  const publishAccumulator = useRef(0)
  const publish = useCallback(() => setSnapshot(snapshotOf(runtime.current)), [])

  useEffect(() => {
    /**
     * Whether the keystroke belongs to a text field rather than to the craft.
     *
     * The flight controls are bare letters on `window`, which is right for a
     * game that is played with no chrome - but the results screen now has a
     * name box in it, and without this check typing a name would fly the ship
     * and, worse, the space bar's `preventDefault` would refuse to type a
     * space at all.
     */
    const editing = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      if (!element || typeof element.tagName !== 'string') return false
      const tag = element.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable === true
    }
    const down = (event: KeyboardEvent) => {
      if (editing(event.target)) return
      keys.current[event.code] = true
      if (event.key.length === 1) keys.current[`Key${event.key.toUpperCase()}`] = true
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault()
    }
    const up = (event: KeyboardEvent) => {
      // Releases are always honoured, even from a text field: a key that went
      // down on the canvas and came up in the box must not stay held.
      keys.current[event.code] = false
      if (event.key.length === 1) keys.current[`Key${event.key.toUpperCase()}`] = false
    }
    const aimBounds = () => document.querySelector<HTMLCanvasElement>('.game-shell canvas')?.getBoundingClientRect() ?? null
    // `matches` stays live, so this is read rather than re-queried per event.
    const touchControls = window.matchMedia?.(TOUCH_CONTROL_QUERY) ?? null
    // See core/aim: a cursor puts the reticle where it is, a finger pushes the
    // reticle by how far it moved.
    const drags = (event: PointerEvent) => event.pointerType === 'touch' && Boolean(touchControls?.matches)
    const move = (event: PointerEvent) => {
      const bounds = aimBounds()
      if (!bounds) return
      if (drags(event)) {
        const drag = touchAim.current
        if (!drag || drag.pointerId !== event.pointerId) return
        const to = { x: event.clientX, y: event.clientY }
        pointer.current = dragAim(pointer.current, drag, to, bounds)
        drag.x = to.x
        drag.y = to.y
        return
      }
      pointer.current = absoluteAim({ x: event.clientX, y: event.clientY }, bounds)
    }
    const press = (event: PointerEvent) => {
      if (!drags(event)) { move(event); return }
      // A thumb on the stick or a fire button is already saying something; it
      // must not drag the reticle across the city on the way.
      if (event.target instanceof Element && event.target.closest(HUD_CONTROLS)) return
      touchAim.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      // An aiming drag is a mobile control like any other. Without this the
      // same swipe would also reach the mouse-steer path below and bank the
      // craft towards whichever side of the screen the thumb ended up on.
      mobile.current.active = true
    }
    const lift = (event: PointerEvent) => {
      // The reticle stays where the finger left it: aim with one thumb, fire
      // with the other.
      if (touchAim.current?.pointerId === event.pointerId) touchAim.current = null
    }
    const leave = () => { pointer.current = { x: 0, y: 0 } }
    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerdown', press)
    window.addEventListener('pointerup', lift)
    window.addEventListener('pointercancel', lift)
    document.documentElement.addEventListener('mouseleave', leave)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', press)
      window.removeEventListener('pointerup', lift)
      window.removeEventListener('pointercancel', lift)
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
    // The general's briefing has to actually reach "hold E to rescue the
    // cat" before E does anything - otherwise a player who taps E while
    // reading the earlier lines finishes the tutorial in the background,
    // the stage flips, movement unlocks, and the ship takes off while the
    // briefing is still mid-sentence.
    const beamUnlocked = !tutorialAtStart || game.tutorialBriefingReady
    const laserUnlocked = !tutorialAtStart || game.tutorialLaserReady
    const turboUnlocked = !tutorialAtStart || game.tutorialTurboReady
    if (tutorialAtStart && beamUnlocked && rawInput.beam) game.tutorialBeamLatched = true
    // The tutorial teaches one control at a time: flight stays inert for all
    // of it, and the laser and turbo answer only once the line that names them
    // is on screen, so at every moment there is exactly one thing to try and
    // the prompt is naming it. Once E has been pressed once, the beam latches
    // on for the rest of the tutorial - see tutorialBeamLatched - so tapping
    // it does not let the cat go mid-pull.
    const input: PlayerInput = tutorialAtStart
      ? {
          ...rawInput,
          throttle: 0,
          strafe: 0,
          vertical: 0,
          special: turboUnlocked && rawInput.special,
          laser: laserUnlocked && rawInput.laser,
          laserContinuous: laserUnlocked && Boolean(rawInput.laserContinuous),
          beam: beamUnlocked && (rawInput.beam || game.tutorialBeamLatched),
        }
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
    stepShake(game.shake, d)
    // Short enough to be over before the laser can fire again, so holding the
    // trigger on a tower reads as repeated hits rather than a solid red block.
    for (const [id, flash] of game.buildingHitFlash) {
      const next = flash - d * BUILDING_HIT_FLASH_FADE
      if (next <= 0) game.buildingHitFlash.delete(id)
      else game.buildingHitFlash.set(id, next)
    }
    for (const [id, flash] of game.landmarkHitFlash) {
      const next = flash - d * BUILDING_HIT_FLASH_FADE
      if (next <= 0) game.landmarkHitFlash.delete(id)
      else game.landmarkHitFlash.set(id, next)
    }
    game.pickupPulse = Math.max(0, game.pickupPulse - d * 3.2)
    game.missionPulse = Math.max(0, game.missionPulse - d * 3.2)
    game.missionBannerTime = Math.max(0, game.missionBannerTime - d)
    game.sizePulse = Math.max(0, game.sizePulse - d * 2.4)
    game.daze = Math.max(0, game.daze - d)
    game.turboLockout = Math.max(0, game.turboLockout - d)
    game.mysteryFlash = Math.max(0, game.mysteryFlash - d)
    game.timeBonusPulse = Math.max(0, game.timeBonusPulse - d * 2.6)
    game.damageCooldown = Math.max(0, game.damageCooldown - d)
    game.collisionCooldown = Math.max(0, game.collisionCooldown - d)
    game.laserCooldown = Math.max(0, game.laserCooldown - d)
    game.broadcastTime = Math.max(0, game.broadcastTime - d)
    stepHealth(game.health, d)
    // Ten seconds of game time, which the tutorial holds at zero: the report
    // is about a craft loose over the city, and during the tutorial the craft
    // is parked over a cat with its flight controls inert. Nothing has
    // happened for the anchor to report yet.
    if (!tutorialAtStart && !game.openingBroadcastDone && game.sessionTime >= BROADCAST_OPENING_AT) {
      game.openingBroadcastDone = true
      raiseBroadcast(game, 0)
    }
    game.laserFlash = Math.max(0, game.laserFlash - d)
    stepLaserBursts(game.laserBursts, d)
    stepFireballs(game.fireballs, d)
    stepLaserProjectiles(game.laserProjectiles, d)
    // One end condition for the clock. It used to fire here AND again on
    // sessionTime, and since the round length and the target were the same
    // number both hit on the same frame.
    if (!tutorialAtStart && game.remainingTime <= 0) {
      const previousStage = game.mission.stage
      const previousRevision = game.mission.revision
      const complete = syncMissionState(game.mission, game.sessionTime, game.score)
      presentMissionChange(game, previousStage, previousRevision)
      endRun(game, complete ? 'EARTH RECON COMPLETE' : 'EARTH RECON FAILED', endingForTimeUp(complete))
      updatePilotStatus(game)
      publish()
      return
    }

    const boostPressed = input.special && !game.boostInputHeld
    game.boostInputHeld = input.special
    const turboActive = game.turboLockout <= 0 && input.special && game.turbo > 0.02
    if (tutorialAtStart && turboActive) game.tutorialTurboUsed = true
    if (turboActive) {
      if (boostPressed) playBoosterSound()
      if (game.drone.boostRemaining <= 0) { setMessage(game, 'msgTurbo', 1.2); tone('upgrade') }
      // Back to the 5s base by design: turbo depth is now bought at mystery
      // circles rather than dealt by cards, and the circles themselves refill
      // the gauge - so the base has to be worth spending between them.
      const duration = 5 + boonBonus(game.boons, 'turbo-capacity')
      game.turbo = Math.max(0, game.turbo - d / duration)
      game.drone.boostRemaining = Math.max(game.drone.boostRemaining, 0.12)
      // <= 0.02, not <= 0: that is the same floor turboActive itself checks,
      // so without matching it here the gauge stalls just above the floor -
      // each frame drains a hair below it, disqualifies itself from draining
      // further, recharges a hair back above it, and repeats forever. That
      // stall is a softer version of the exact "turbo never runs out" bug
      // this lockout exists to close.
      if (game.turbo <= 0.02) {
        // The gauge keeps refilling through the lockout - the cost of running
        // it dry is a forced pause, not a longer wait for the bar to move.
        game.turboLockout = 2
        setMessage(game, 'msgTurboOverload', 2)
        tone('warning')
      }
    } else game.turbo = Math.min(1, game.turbo + d * 0.13 * boonMultiplier(game.boons, 'turbo-recharge'))

    const mysteryCircle = mysteryCircleAt(game.drone.position)
    if (mysteryCircle) {
      if (game.mysteryCircleId !== mysteryCircle.id) {
        game.mysteryCircleId = mysteryCircle.id
        game.mysteryCirclesVisited.add(mysteryCircle.id)
        reportMissionEvent(game, { type: 'pass-mystery-circle', id: mysteryCircle.id })
        game.mysteryBoostRemaining = MYSTERY_BOOST_DURATION
        game.mysteryFlash = 0.65
        game.turbo = 1
        game.turboLockout = 0
        playMysteryCircleSound()
        // Give a moving craft the surge immediately, while leaving a parked
        // craft to choose its own direction with the next throttle input.
        const horizontalSpeed = Math.hypot(game.drone.velocity.x, game.drone.velocity.z)
        if (horizontalSpeed > 0.5 || input.throttle > 0) {
          const direction = horizontalSpeed > 0.5
            ? { x: game.drone.velocity.x / horizontalSpeed, z: game.drone.velocity.z / horizontalSpeed }
            : { x: Math.sin(game.drone.heading), z: Math.cos(game.drone.heading) }
          game.drone.speed = Math.max(game.drone.speed, DRONE_DEFAULTS.maxSpeed * MYSTERY_BOOST_MAX_MULTIPLIER)
          game.drone.velocity.x = direction.x * game.drone.speed
          game.drone.velocity.z = direction.z * game.drone.speed
        }
      } else game.mysteryBoostRemaining = MYSTERY_BOOST_DURATION
    } else {
      game.mysteryCircleId = null
      game.mysteryBoostRemaining = Math.max(0, game.mysteryBoostRemaining - d)
    }
    // The pickup hovering over an unspent circle. Eaten by flying into it:
    // the circle itself triggers at any altitude, the item only at its own
    // height, so the surge is a drive-through and the boon is an approach.
    if (mysteryCircle && !tutorialAtStart && !game.boons.claimed.has(mysteryCircle.id)) {
      const itemY = boonHoverY(game.sessionTime, mysteryCircle.id)
      const slack = game.sizeProfile.hitRadius * 0.4
      const horizontal = Math.hypot(game.drone.position.x - mysteryCircle.x, game.drone.position.z - mysteryCircle.z)
      if (horizontal <= BOON_PICKUP_RADIUS + slack && Math.abs(game.drone.position.y - itemY) <= BOON_PICKUP_VERTICAL + slack) {
        const granted = claimBoon(game.boons, mysteryCircle.id)
        if (granted) {
          game.pickupPulse = 1
          game.mysteryFlash = Math.max(game.mysteryFlash, 0.65)
          if (granted.kind === 'stat') {
            setMessage(game, BOON_MESSAGE_KEY[granted.id], 2.2, granted.level)
            tone('upgrade')
          } else if (game.health.current < game.health.max) {
            // Every stat is capped, so the item patches the hull instead.
            healHealth(game.health, BOON_HEAL_PIPS)
            setMessage(game, 'msgBoonHeal', 2.2)
            tone('upgrade')
          } else {
            // Capped and healthy: the pickup pays out like a meal would.
            const reward = Math.round(BOON_FULL_SCORE * game.sizeProfile.scoreMultiplier)
            game.score += reward
            setMessage(game, 'msgBoonScore', 2.2, reward)
            tone('pickup')
          }
        }
      }
    }
    const mysterySpeedMultiplier = mysteryBoostMultiplier(game.mysteryBoostRemaining)
    const flightInput: DroneInput = { ...input, special: false, speedMultiplier: mysterySpeedMultiplier }
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
        endRun(game, 'CRUSHED BY THE LOAD', 'downed')
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
      // stepDrone's own speed coefficient is 0.12 per level; dividing the
      // pickup bonus by it feeds the exact 8%-per-level the boon promises.
      speed: boonBonus(game.boons, 'speed') / 0.12,
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
    if (game.checkpoint) {
      // A checkpoint is a gate now, not a parking spot: touching the ring
      // counts immediately and moves the next ring far enough away that this
      // same entry cannot be counted again on the following frame.
      if (isInsideAirCheckpoint(game.drone.position, game.checkpoint)) {
        reportMissionEvent(game, { type: 'pass-checkpoint' })
        if (missionHasQuest(game.mission, 'air-checkpoints')) spawnCheckpoint(game)
        else game.checkpoint = null
      }
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
    if (!tutorialAtStart) stepEnemies(game.enemies, game.drone.position, d, game.drone.velocity, game.sizeProfile.hitRadius)
    const mineExplosion = game.enemies.mineExplosion
    if (mineExplosion) {
      playDroneExplosionSound()
      triggerLaserBurst(game.laserBursts, 'impact', mineExplosion.position, '#ff4f62')
      // The fire covers exactly what the blast killed, so the shell the mine
      // was drawing beforehand and the explosion agree with each other.
      triggerFireball(game.fireballs, 'mine', mineExplosion.position, mineExplosion.radius, blastSeed(game))
      const distance = Math.hypot(
        mineExplosion.position.x - game.drone.position.x,
        mineExplosion.position.y - game.drone.position.y,
        mineExplosion.position.z - game.drone.position.z,
      )
      if (distance <= mineExplosion.radius) registerImpact(game, 'ENEMY', 'contact', DRONE_BLAST_TRAUMA)
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
    updateNearbyCatCry(game, d)
    const beamField: BeamField = {
      active: game.beamActive,
      boosting: turboActive,
      position: game.drone.position,
      velocity: game.drone.velocity,
      // Radius, reach and pull all follow the hull: a bigger craft sweeps a
      // wider cone, reaches the street from its own cruising altitude, and
      // hauls what it catches visibly faster - no card involved in any of it.
      radiusScale: game.sizeProfile.beamScale,
      reachScale: game.sizeProfile.beamReach,
      gripScale: game.sizeProfile.beamPull,
      // Natural grip from size, and nothing else - the whole 1..12 ladder is
      // growth now.
      gripStrength: beamStrength(game),
      // So a dropped load lands on the roof it was dropped over rather than
      // falling through it into the street.
      colliders: game.worldColliders,
    }
    // What the beam does to a rare landmark, and what it takes.
    //
    // Touching one used to detonate it: sweep the cone across a forecourt or a
    // comms mast and it went up in a full blast, at any craft size, from a
    // graze nobody aimed. The beam is a tractor beam, so contact alone must
    // never be a demolition.
    //
    // A comms mast is city dressing with a weight in WORLD_PROP_MASS, so it is
    // not handled here at all any more - a beam strong enough tears it out of
    // the ground and carries it off like any other prop (see the lifted comms
    // pool), and the laser is what blows it up. A gas station has no lifted
    // model to carry, so the beam route for it stays a demolition - but it now
    // costs the same weight ladder everything else does, rather than a brush
    // of the cone.
    if (game.beamActive && beamLiftScale(GAS_STATION_BEAM_MASS, beamStrength(game)) > 0) {
      for (const landmark of destructibleLandmarksAround(game.drone.position, 1)) {
        if (landmark.kind !== 'gas-station') continue
        if (game.destroyedLandmarks.has(landmark.id)) continue
        const contact = { position: { x: landmark.position.x, y: 0.65, z: landmark.position.z } }
        if (isInsideBeam(contact, beamField)) detonateLandmark(game, landmark)
      }
    }
    // No pickup cap: hanging mass is its own limit, and a craft that grabbed
    // too much should feel it rather than be quietly protected from it.
    //
    // The weight ladder does apply, though. Capturing takes a car out of the
    // road network for good, and a beam that cannot lift it has no business
    // doing that: the car would be dumped dead in the street, its traffic slot
    // spent, with nothing the craft could do about it. Under the band the
    // cone simply plays over the roof and the car drives on.
    if (game.beamActive && beamLiftScale(CAR_MASS, beamStrength(game)) > 0) {
      for (const car of game.traffic.cars) {
        if (!car.active || !isInsideBeam(car, beamField)) continue
        const captured = captureTrafficCar(game.traffic, car.id)
        if (captured) game.beamObjects.unshift(makeTrafficBeamObject(captured))
      }
    }
    if (!tutorialAtStart) stepHazards(game.hazards, { position: game.drone.position, heading: game.drone.heading, elapsed: game.sessionTime }, d)
    grabBuildings(game, beamField)
    stepBeamObjects(game.beamObjects, beamField, d)
    // Crowd movement owns its absorption timer; beam physics only handles the
    // pull so the shrink animation is not advanced twice per frame.
    stepBeamObjects(game.crowds.objects, beamField, d, false)
    stepBeamObjects(game.hazards.objects, beamField, d)
    stepBeamObjects(game.enemies.slots, beamField, d)
    // Weight decides what the craft can move; bulk decides what it can eat.
    //
    // This was POSITIVE_INFINITY, which switched the size half off entirely -
    // `isAbsorbable` took a `maxDiameter` and documented a hull rule that was
    // never actually applied. A hull cannot swallow what will not fit through
    // it, whatever the beam can drag, so the rule is now handed the number it
    // always wanted.
    //
    // Be honest about what this changes today: nothing. Now that strength
    // comes from size alone, the weight ladder opens later than the hull for
    // every object in the game - a car fits the hull at 0.54 and is liftable
    // at 1.13, a shelter fits at 1.34 and lifts at 3.77 - so weight is what
    // the player actually feels and this never fires on its own. It is the
    // invariant, not the balance: the moment a mass or a diameter is retuned,
    // or anything raises strength without widening the hull, it is what stops
    // a two-metre saucer swallowing an eight-metre station mouth.
    //
    // Above it the beam still lifts and carries - that is the weight ladder's
    // business and it is untouched - the load simply hangs as ballast instead
    // of vanishing, and you fly it somewhere or cut the beam.
    const maxAbsorbDiameter = ufoDiameter(game.sizeProfile.size)
    // The same integer the lifting ladder runs on, and it gates every object
    // rather than city dressing alone. Flying low over a shelter - or a car,
    // or a tanker - the beam could never shift leaves it where it is rather
    // than eating it on contact.
    const absorbStrength = beamStrength(game)
    const absorbFrom = (objects: BeamObject[]) => {
      let object = beginNearbyBeamObjectAbsorption(objects, game.drone.position, maxAbsorbDiameter, game.sizeProfile.absorbDistance, absorbStrength)
      while (object) {
        triggerLaserBurst(game.laserBursts, 'impact', object.position, object.kind === 'cat' || object.kind === 'pedestrian' ? '#fff06d' : '#6deeff')
        if (object.kind === 'cat' || object.kind === 'pedestrian') absorbCrowd(game, object.kind)
        else absorbBeamObject(game, object)
        object = beginNearbyBeamObjectAbsorption(objects, game.drone.position, maxAbsorbDiameter, game.sizeProfile.absorbDistance, absorbStrength)
      }
    }
    absorbFrom(game.crowds.objects)
    absorbFrom(game.beamObjects)
    absorbFrom(game.hazards.objects)
    absorbFrom(game.enemies.slots)
    // A tanker used to detonate here the moment the beam drew it within 3.4m,
    // which made the one heavy vehicle worth the most points the one object in
    // the city that punished the verb the whole run teaches. It is food now:
    // it goes up the beam and is swallowed by the same gates as everything
    // else, and the laser remains the way to blow one up on purpose.
    game.loadedCars = loadedCarCount(game)
    game.ballast = beamBallast(game)
    for (let index = game.beamObjects.length - 1; index >= 0; index -= 1) {
      const object = game.beamObjects[index]!
      if (object.active) continue
      if (object.explosionPending) {
        object.explosionPending = false
        triggerLaserBurst(game.laserBursts, 'impact', object.position, '#ff8a45')
        triggerFireball(game.fireballs, 'vehicle', object.position, undefined, blastSeed(game))
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
      if (aim.targetKind) triggerLaserBurst(game.laserBursts, 'impact', aim.point, aim.targetKind === 'car' ? '#ffb24d' : aim.targetKind === 'fighter' ? '#ff557f' : aim.targetKind === 'building' ? '#6deeff' : aim.targetKind === 'person' ? '#fff06d' : aim.targetKind === 'prop' ? '#9be8ff' : '#fff0a1')
      // Every shot that lands spits a little fire off the surface, right where
      // it hit. It is over inside the 0.27s between shots, so holding the
      // trigger on a tower burns along the wall rather than piling up.
      if (aim.targetKind) triggerFireball(game.fireballs, 'strike', aim.point, undefined, blastSeed(game))
      if (aim.targetKind === 'fighter' && aim.targetId) registerEnemyLaserHit(game, aim.targetId)
      if (aim.targetKind === 'building' && aim.targetId) registerBuildingLaserHit(game, aim.targetId)
      if (aim.targetKind === 'person' && aim.targetId) registerPersonLaserHit(game, aim.targetId)
      if (aim.targetKind === 'prop' && aim.targetId) registerPropLaserHit(game, aim.targetId, direction)
      if (aim.targetKind === 'landmark' && aim.targetId) {
        const landmark = destructibleLandmarksAround(game.drone.position).find((candidate) => candidate.id === aim.targetId)
        // Two base hits, scaled by laser power - a maxed laser one-shots. The
        // first shot lights the landmark up and leaves it standing.
        if (landmark && !game.destroyedLandmarks.has(landmark.id)) {
          const result = damageLandmark(game.landmarkHealth, landmark.id, boonMultiplier(game.boons, 'laser-power'))
          game.landmarkHitFlash.set(landmark.id, 1)
          if (result.destroyed) detonateLandmark(game, landmark)
        }
      }
      if (aim.targetKind === 'car' && aim.targetId) {
        const destroyed = aim.targetId.startsWith('hazard:')
          ? registerHeavyVehicleLaserHit(game, aim.targetId)
          : destroyCar(game, aim.targetId, direction)
        if (destroyed) setMessage(game, 'msgCarLaunched', 0.9)
      }
      game.laserShotsFired += 1
      if (tutorialAtStart) game.tutorialLaserFired = true
      playLaserSound()
    }
    game.laserActive = game.laserFlash > 0

    // Buildings (and ruins) are real cover from the orb curtains: the same
    // collider pool the craft flies against also catches the slow rounds.
    const projectileDamage = stepEnemyProjectiles(game.enemies, game.drone.position, d, game.sizeProfile.hitRadius, game.worldColliders)
    if (projectileDamage > 0) registerImpact(game, 'ENEMY', game.enemies.lastHitKind ?? 'contact')
    // A bigger craft is a bigger target: the same stream of fire is harder to
    // survive once fat, which is what stops growth from being free.
    const contactDamage = resolveEnemyContacts(game.enemies, game.drone.position, game.sizeProfile.hitRadius)
    // A drone only ever dies on contact by going off, so its kill count is
    // also the count of blasts that just went off against the hull.
    const contactBlasts = game.enemies.contactKills
    if (contactBlasts > 0) {
      playDroneExplosionSound()
      game.enemiesDown += contactBlasts
      game.score += contactBlasts * 35
      triggerLaserBurst(game.laserBursts, 'impact', game.enemies.lastContactPoint, '#ff9a3d')
      // Ploughing through a drone detonates it just as surely as shooting it.
      triggerFireball(game.fireballs, 'aircraft', game.enemies.lastContactPoint, undefined, blastSeed(game))
    }
    // Contact damage can come from anything solid; a drone detonation or a
    // helicopter ram earns the shake, so the trauma rides on the blow that
    // deserves it rather than on the damage number.
    const ramTrauma = game.enemies.helicopterRams > 0 ? HELICOPTER_RAM_TRAUMA : 0
    if (contactDamage > 0) registerImpact(game, 'ENEMY', 'contact', contactBlasts > 0 ? DRONE_BLAST_TRAUMA : ramTrauma)
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
    touchAim.current = null
    const game = runtime.current
    game.phase = 'playing'
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


  const unlockTutorialControl = useCallback((control: TutorialControl) => {
    const game = runtime.current
    if (control === 'beam') game.tutorialBriefingReady = true
    if (control === 'laser') game.tutorialLaserReady = true
    if (control === 'turbo') game.tutorialTurboReady = true
    publish()
  }, [publish])

  const restart = useCallback(() => {
    stopBeamSound()
    unlockAudio()
    stopLobbyMusic()
    startGameplayMusic()
    pointer.current = { x: 0, y: 0 }
    touchAim.current = null
    runtime.current = makeRuntime()
    runtime.current.phase = 'playing'
    publish()
  }, [publish])

  const setMobileInput = useCallback((input: Partial<MobileInput>) => { Object.assign(mobile.current, input) }, [])
  const value = useMemo<GameContextValue>(() => ({ runtime, snapshot, readInput, advance, start, restart, unlockTutorialControl, setMobileInput, quality, setQuality, language, setLanguage, t: STRINGS[language] }), [advance, quality, readInput, restart, unlockTutorialControl, setMobileInput, setQuality, snapshot, start, language, setLanguage])
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGame must be used inside GameProvider')
  return value
}

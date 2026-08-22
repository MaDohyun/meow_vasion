import { BEAM_ABSORB_TIME, beginNearbyBeamObjectAbsorption, type BeamObject } from './beam'
import type { CrowdSpawnZone } from './cityLandmarks'
import type { Aabb, Vec3 } from './drone'
import { isLakeAt, WORLD_CELL_SIZE } from './world'

export type CrowdKind = 'pedestrian' | 'cat'
/**
 * Pool sizes.
 *
 * Raised because a city is the point: the streets read as empty when the whole
 * crowd fits in a park. The cost is close to linear rather than quadratic -
 * crowd members are skipped in each other's threat checks (see crowdThreatStart),
 * so a body only ever tests against the craft and the handful of real threats,
 * and each of them draws from one instanced pool regardless of count.
 */
export const PEDESTRIAN_MAX = 80
export const CAT_MAX = 24
// Fill the existing pedestrian pool from the opening. The old seed left too
// much empty pavement between targets; the fuller, dispersed seed makes the
// city read much busier without creating another render pool.
export const INITIAL_PEDESTRIANS = PEDESTRIAN_MAX
export const INITIAL_CATS = CAT_MAX
// Tight on purpose. The pool is fixed size, so stragglers left alive far behind
// the player squat in every slot and block respawns near the path: the pool
// saturated at 53 bodies while only two or three were ever within reach.
// Recycling early keeps the supply in front of the player instead of trailing
// it. Kept just outside the respawn ring so bodies are not culled on arrival.
/**
 * Beam mass for living bodies.
 *
 * Doubled so a body rides the beam long enough to be watched coming up rather
 * than blinking out on contact. Inert objects went up by three - see CAR_MASS -
 * and that gap is what makes hauling the wrong thing feel different from
 * hauling the right one.
 */
export const CAT_MASS = 1
export const PEDESTRIAN_MASS = 2

/** Only genuinely distant actors leave the fixed pool; turning the camera is never a cull. */
export const CROWD_REMOVE_DISTANCE = 300
/** Mid-run replacements cannot appear within this player safety ring. */
export const CROWD_SPAWN_MIN_DISTANCE = 110
export const CROWD_ABSORB_DISTANCE = 3.35
export const CROWD_ABSORB_TIME = BEAM_ABSORB_TIME

// Flee thresholds are split so the state cannot flip on a single frame. A calm
// crowd member only starts running inside FLEE_ENTER, and a running one only
// calms down once it is past the wider FLEE_EXIT ring.
const FLEE_ENTER_DISTANCE: Record<CrowdKind, number> = { pedestrian: 14, cat: 18 }
const FLEE_EXIT_DISTANCE: Record<CrowdKind, number> = { pedestrian: 20, cat: 26 }
const FLEE_HOLD_TIME = 0.9
const FLEE_SPEED: Record<CrowdKind, number> = { pedestrian: 7, cat: 7.8 }
const WANDER_SPEED: Record<CrowdKind, number> = { pedestrian: 1.7, cat: 2.35 }
const FLEE_BLEND = 9
const WANDER_BLEND = 4
const TURN_COOLDOWN = 0.35
const COLLIDER_MARGIN = 0.55
const SPAWN_CLEARANCE = 0.9
// Pedestrians render at half their former height, so three metres still leaves
// several body widths between them without wasting the visible street space.
const SPAWN_CROWD_CLEARANCE = 3.2
const SPAWN_ATTEMPTS = 24
// Replacements are prepared behind the current camera cone. The player meets
// them naturally after changing street or turning around; they never blink
// into a road already on screen.
const RESPAWN_MIN_DISTANCE = 130
/**
 * How far a park or car park has to be before it may be used as a respawn.
 *
 * Just inside the forward arc's own minimum, so the two branches agree about
 * what "not on top of the player" means.
 */
const ZONE_MIN_DISTANCE = CROWD_SPAWN_MIN_DISTANCE
/** How far round toward the back a zone has to sit before it can host a
 * replacement. Zero would be the whole rear half-plane. */
const ZONE_FORWARD_BIAS = 0.25
const RESPAWN_RANGE = 120
const RESPAWN_ARC = 1.8
// Loading may place the initial district one block away; normal replacements
// use the wider safety ring above, so this is the only time actors begin
// closer to the player.
const OPENING_MIN_DISTANCE = 48
const OPENING_MAX_DISTANCE = 180
/**
 * Respawns are deliberately single-body placements. A denser city only reads
 * alive when the bodies occupy different stretches of pavement; filling a
 * small number of knots makes a large pool look like the same few people.
 */
const CLUSTER_SIZE = 1
const CLUSTER_SPREAD = 4
const PARK_CLUSTER_SIZE = 1
const PARK_CLUSTER_OFFSETS = [
  { x: -9.2, z: -6.2 },
  { x: 9.0, z: -2.0 },
  { x: 0, z: 9.5 },
] as const

/**
 * People walk somewhere instead of turning at random.
 *
 * A random walk keeps a crowd where it spawned: over a minute the expected
 * displacement of ninety-degree turns every couple of seconds is close to zero,
 * so a park seeded with sixteen people still holds sixteen people, in a knot,
 * and the streets around it stay empty no matter how many bodies the pool
 * carries. Giving each body a destination on a road spreads the same crowd
 * across the city on its own, without touching a single spawn weight.
 *
 * Destinations sit on the road grid: carriageways run along every multiple of
 * WORLD_CELL_SIZE, so a lane offset just off the kerb puts the walk on a
 * pavement rather than through the middle of traffic or across a building.
 */
const PAVEMENT_LANE = 3.65
const DESTINATION_MIN = 26
const DESTINATION_RANGE = 70
const DESTINATION_ARRIVE = 3.2
/** Give-up timer. A destination behind a wall must not strand a body forever. */
const DESTINATION_TIMEOUT = 26
/** The rest stay local - a city where nobody ever loiters reads as a parade. */
const ROAMER_SHARE = 0.22

export type CrowdObject = BeamObject & {
  kind: CrowdKind
  slot: number
  generation: number
  heading: number
  /** Locals with no errand. They keep the old random walk. */
  roams: boolean
  targetX: number
  targetZ: number
  wanderTimer: number
  pauseTimer: number
  fleeTimer: number
  turnCooldown: number
  slideDirection: number
  /** A spawned slot only becomes disposable after it has actually entered view. */
  wasVisible: boolean
}

export type CrowdState = {
  objects: CrowdObject[]
  spawnTimer: number
  randomState: number
  nearbyPedestrians: number
  initialSpawnDone: boolean
  seedAngle: number
  clusterX: number
  clusterZ: number
  clusterLeft: number
  clusterKind: 'park' | 'parking-lot' | 'road' | null
}

export type CrowdView = {
  position: Vec3
  heading: number
  horizontalFov?: number
  /** Keep the opening's single cat as the only feline until it is absorbed. */
  tutorialCatOnly?: boolean
  colliders?: readonly Aabb[]
  threats?: readonly Vec3[]
  crowdThreatStart?: number
  spawnZones?: readonly CrowdSpawnZone[]
}

/** Matches the chase camera's horizontal view so disposable crowd slots can
 * stay focused on the streets the player is currently looking at. */
export function crowdObjectIsVisible(position: Pick<Vec3, 'x' | 'y' | 'z'>, view: CrowdView) {
  const dx = position.x - view.position.x
  const dz = position.z - view.position.z
  const distance = Math.hypot(dx, dz)
  if (distance < 0.001) return true
  const forwardX = Math.sin(view.heading)
  const forwardZ = Math.cos(view.heading)
  const dot = (dx * forwardX + dz * forwardZ) / distance
  // The chase camera sees a generous slice of the road grid; keeping the
  // disposable pool inside that slice gives the player a city to fly through
  // without letting it pile up behind the craft.
  const halfFov = (view.horizontalFov ?? 118) * Math.PI / 360
  return dot >= Math.cos(halfFov) && Math.abs(position.y - view.position.y) <= Math.max(18, distance * 0.8)
}

/** Living crowd may use parks and pavements, but never the lake surface. */
export function crowdPositionIsWalkable(position: Pick<Vec3, 'x' | 'z'>) {
  return !isLakeAt(position)
}

function makeCrowdObject(kind: CrowdKind, slot: number): CrowdObject {
  return {
    id: `crowd:${kind}:${slot}:0`,
    kind,
    slot,
    generation: 0,
    mass: kind === 'cat' ? CAT_MASS : PEDESTRIAN_MASS,
    color: kind === 'cat' ? '#f3c36d' : '#ff8bb4',
    position: { x: 0, y: 0.65, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    active: false,
    inBeam: false,
    tether: 0,
    playerTouched: false,
    destroying: false,
    destroyTimer: 0,
    explosionPending: false,
    absorbing: false,
    absorbTimer: 0,
    diameter: kind === 'cat' ? 0.55 : 0.78,
    scoreValue: kind === 'cat' ? 40 : 15,
    heading: 0,
    roams: true,
    targetX: 0,
    targetZ: 0,
    wanderTimer: 0,
    pauseTimer: 0,
    fleeTimer: 0,
    turnCooldown: 0,
    slideDirection: 0,
    wasVisible: false,
  }
}

export function createCrowdState(seed = 0xc47cafe): CrowdState {
  const objects: CrowdObject[] = []
  for (let slot = 0; slot < PEDESTRIAN_MAX; slot += 1) objects.push(makeCrowdObject('pedestrian', slot))
  for (let slot = 0; slot < CAT_MAX; slot += 1) objects.push(makeCrowdObject('cat', slot))
  return {
    objects,
    spawnTimer: 0,
    randomState: seed >>> 0 || 1,
    nearbyPedestrians: 0,
    initialSpawnDone: false,
    seedAngle: 0,
    clusterX: 0,
    clusterZ: 0,
    clusterLeft: 0,
    clusterKind: null,
  }
}

/** Exactly one cat and no other crowd actor in the opening 3x3 park. */
export function prepareTutorialCrowd(state: CrowdState, position: Pick<Vec3, 'x' | 'z'>) {
  for (const object of state.objects) object.active = false
  const cat = state.objects.find((object) => object.kind === 'cat')!
  cat.generation += 1
  cat.id = `tutorial-cat:${cat.generation}`
  cat.position.x = position.x
  cat.position.y = 0.65
  cat.position.z = position.z
  cat.velocity.x = 0
  cat.velocity.y = 0
  cat.velocity.z = 0
  cat.active = true
  cat.inBeam = false
  cat.tether = 0
  cat.absorbing = false
  cat.absorbTimer = 0
  cat.wasVisible = false
  cat.roams = false
  cat.targetX = position.x
  cat.targetZ = position.z
  cat.pauseTimer = 999
  // The opening cat is the only stationary crowd member. The game can still
  // populate moving people immediately around it on its first simulation tick.
  state.initialSpawnDone = false
  state.spawnTimer = Number.POSITIVE_INFINITY
  return cat
}

export function finishTutorialCrowd(state: CrowdState) {
  state.spawnTimer = 0
  state.clusterLeft = 0
  state.clusterKind = null
}

function random(state: CrowdState) {
  let value = state.randomState || 1
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  state.randomState = value >>> 0
  return state.randomState / 0xffffffff
}

/**
 * Puts the next errand on a road, a block or two away.
 *
 * One axis snaps to the nearest carriageway and steps off it by a lane width;
 * the other runs along that road. The result is a walk down a street rather
 * than a diagonal through the block, and because the axis is re-rolled each
 * time, a body turns corners over a run instead of leaving on a single bearing.
 */
function pickDestination(state: CrowdState, object: CrowdObject) {
  const distance = DESTINATION_MIN + random(state) * DESTINATION_RANGE
  const along = random(state) < 0.5 ? -1 : 1
  const lane = (random(state) < 0.5 ? -1 : 1) * PAVEMENT_LANE
  if (random(state) < 0.5) {
    object.targetZ = Math.round(object.position.z / WORLD_CELL_SIZE) * WORLD_CELL_SIZE + lane
    object.targetX = object.position.x + along * distance
  } else {
    object.targetX = Math.round(object.position.x / WORLD_CELL_SIZE) * WORLD_CELL_SIZE + lane
    object.targetZ = object.position.z + along * distance
  }
  object.wanderTimer = DESTINATION_TIMEOUT
}

function blockedAt(view: CrowdView, x: number, z: number, margin: number) {
  if (!view.colliders) return false
  for (const collider of view.colliders) {
    if (x > collider.minX - margin && x < collider.maxX + margin && z > collider.minZ - margin && z < collider.maxZ + margin) return true
  }
  return false
}

function crowdedAt(state: CrowdState, x: number, z: number) {
  for (const candidate of state.objects) {
    if (!candidate.active || candidate.absorbing) continue
    if (Math.hypot(candidate.position.x - x, candidate.position.z - z) < SPAWN_CROWD_CLEARANCE) return true
  }
  return false
}

type CrowdPlacement = { angle: number; distance: number } | { x: number; z: number; radius: number }

// The run-start seed and the steady-state respawn want different placements:
// loading pre-populates a distant, visible district, while replacements never
// enter the player safety ring during play.
function spawnCrowdObject(
  state: CrowdState,
  view: CrowdView,
  kind: CrowdKind,
  placement?: CrowdPlacement,
  openingPreload = false,
) {
  let object: CrowdObject | null = null
  for (const candidate of state.objects) {
    if (!candidate.active && candidate.kind === kind) { object = candidate; break }
  }
  if (!object) return false
  let x = 0
  let z = 0
  let placed = false
  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
    // Widen the search on each retry so a dense block of buildings cannot make
    // a seed slot fail outright.
    const spread = 0.35 + attempt * 0.55
    if (placement && 'x' in placement) {
      x = placement.x + (random(state) - 0.5) * placement.radius * (0.7 + attempt * 0.2)
      z = placement.z + (random(state) - 0.5) * placement.radius * (0.7 + attempt * 0.2)
    } else if (placement) {
      const angle = placement.angle + (random(state) - 0.5) * spread
      const distance = placement.distance * (0.85 + random(state) * (0.3 + attempt * 0.15))
      x = view.position.x + Math.sin(angle) * distance
      z = view.position.z + Math.cos(angle) * distance
    } else {
      // Open a fresh knot once the current one is used up.
      if (state.clusterLeft <= 0) {
        const zoneRoll = random(state)
        const zones = view.spawnZones
        const wantedKind = zoneRoll < 0.68 ? 'park' : zoneRoll < 0.82 ? 'parking-lot' : null
        let zone: CrowdSpawnZone | undefined
        if (wantedKind && zones?.length) {
          // Only zones outside the safety ring and behind the current view.
          //
          // The zone branch used to take any park within range, including the
          // one directly underneath - so hovering over a park respawned food
          // at the player's feet for as long as they cared to hold the beam,
          // and standing still was the strongest play in the game. The forward
          // arc below always had a minimum distance; this branch simply never
          // got one.
          //
          // Preloading behind the player makes the approach into a new street
          // continuous rather than creating a pedestrian in an open view.
          const matches = zones.filter((candidate) => {
            const dx = candidate.x - view.position.x
            const dz = candidate.z - view.position.z
            if (Math.hypot(dx, dz) < ZONE_MIN_DISTANCE) return false
            const forward = (dx * Math.sin(view.heading) + dz * Math.cos(view.heading)) / Math.max(0.001, Math.hypot(dx, dz))
            return forward < -ZONE_FORWARD_BIAS
          })
          zone = matches[Math.floor(random(state) * matches.length)]
        }
        if (zone) {
          state.clusterX = zone.x
          state.clusterZ = zone.z
          state.clusterKind = zone.kind
          state.clusterLeft = zone.kind === 'park' ? PARK_CLUSTER_SIZE : 3
        } else {
          const angle = view.heading + Math.PI + (random(state) - 0.5) * RESPAWN_ARC
          const distance = RESPAWN_MIN_DISTANCE + random(state) * RESPAWN_RANGE
          state.clusterX = view.position.x + Math.sin(angle) * distance
          state.clusterZ = view.position.z + Math.cos(angle) * distance
          state.clusterLeft = CLUSTER_SIZE
          state.clusterKind = 'road'
        }
      }
      if (state.clusterKind === 'park') {
        const groupIndex = Math.min(
          PARK_CLUSTER_OFFSETS.length - 1,
          Math.floor((PARK_CLUSTER_SIZE - state.clusterLeft) / 3),
        )
        const offset = PARK_CLUSTER_OFFSETS[groupIndex]
        const jitter = 2.4 + attempt * 1.2
        x = state.clusterX + offset.x + (random(state) - 0.5) * jitter
        z = state.clusterZ + offset.z + (random(state) - 0.5) * jitter
      } else {
        const jitter = CLUSTER_SPREAD * (0.4 + attempt * 0.5)
        x = state.clusterX + (random(state) - 0.5) * jitter
        z = state.clusterZ + (random(state) - 0.5) * jitter
      }
    }
    const candidatePosition = { x, y: 0.65, z }
    const playerDistance = Math.hypot(x - view.position.x, z - view.position.z)
    if (!blockedAt(view, x, z, SPAWN_CLEARANCE)
      && crowdPositionIsWalkable(candidatePosition)
      && !crowdedAt(state, x, z)
      && playerDistance >= (openingPreload ? OPENING_MIN_DISTANCE : CROWD_SPAWN_MIN_DISTANCE)
      // A normal replacement does not need to be in the current view. The
      // opening preload is allowed there because it is complete before the
      // first frame rather than popping in during play.
      && (openingPreload || !crowdObjectIsVisible(candidatePosition, view))) {
      placed = true
      break
    }
  }
  if (!placed) return false
  if (!placement) state.clusterLeft -= 1
  object.generation += 1
  object.id = `crowd:${kind}:${object.slot}:${object.generation}`
  object.position.x = x
  object.position.y = 0.65
  object.position.z = z
  object.heading = kind === 'pedestrian'
    ? Math.round(random(state) * 4) * Math.PI / 2
    : random(state) * Math.PI * 2
  object.rotation.x = 0
  object.rotation.y = object.heading
  object.rotation.z = 0
  object.velocity.x = Math.sin(object.heading) * WANDER_SPEED[kind]
  object.velocity.y = 0
  object.velocity.z = Math.cos(object.heading) * WANDER_SPEED[kind]
  object.angularVelocity.x = 0
  object.angularVelocity.y = 0
  object.angularVelocity.z = 0
  object.roams = kind === 'cat' || random(state) < ROAMER_SHARE
  object.wanderTimer = 1 + random(state) * 3
  if (!object.roams) pickDestination(state, object)
  object.pauseTimer = 0
  object.fleeTimer = 0
  object.turnCooldown = 0
  object.slideDirection = 0
  object.wasVisible = false
  object.active = true
  object.inBeam = false
  object.tether = 0
  object.playerTouched = false
  object.destroying = false
  object.destroyTimer = 0
  object.explosionPending = false
  object.absorbing = false
  object.absorbTimer = 0
  return true
}

// A shuffled radial pattern fills the current camera wedge without bunching
// several people into the same stretch of pavement.
function seedInitialCrowd(state: CrowdState, view: CrowdView, catsEnabled = true) {
  const existingPedestrians = activeCrowdCount(state, 'pedestrian')
  const existingCats = activeCrowdCount(state, 'cat')
  const pedestrianCount = Math.max(0, INITIAL_PEDESTRIANS - existingPedestrians)
  const catCount = catsEnabled ? Math.max(0, INITIAL_CATS - existingCats) : 0
  const total = pedestrianCount + catCount
  for (let index = 0; index < total; index += 1) {
    // Interleave cats between pedestrians where they are enabled, while the
    // tutorial keeps its one stationary cat as the sole feline target.
    const kind: CrowdKind = catsEnabled && index % 3 === 2 && index / 3 < catCount ? 'cat' : 'pedestrian'
    // A shuffled radial sequence fills the current view wedge evenly. A full
    // ring looks statistically dense, but leaves the camera staring at empty
    // streets while most of the pool exists behind it.
    const fraction = (index + 0.5) / total
    const radialFraction = ((index * 37) % total + 0.5) / total
    const distance = Math.sqrt(
      OPENING_MIN_DISTANCE ** 2 + radialFraction * (OPENING_MAX_DISTANCE ** 2 - OPENING_MIN_DISTANCE ** 2),
    )
    // Keep a sparse, central travel lane as well as the wide scatter. This is
    // not a cluster (its members still span several city blocks), but it
    // means a pilot who simply flies forward reaches a living street instead
    // of needing a turn before seeing their first target.
    const centralLane = index % 3 === 0
    const laneFraction = centralLane
      ? ((Math.floor(index / 3) + 0.5) / Math.ceil(total / 3) - 0.5) * 0.38
      : (fraction - 0.5) * RESPAWN_ARC
    const groupAngle = view.heading + laneFraction
    state.seedAngle = groupAngle
    const groupX = view.position.x + Math.sin(groupAngle) * distance
    const groupZ = view.position.z + Math.cos(groupAngle) * distance
    const placement = { x: groupX, z: groupZ, radius: CLUSTER_SPREAD }
    let placed = spawnCrowdObject(state, view, kind, placement, true)
    // Dense city blocks occasionally reject every jitter around one particular
    // point. Keep the same kind and look along nearby visible road space so a
    // bad block never leaves a fixed pool slot empty at run start.
    for (let retry = 1; retry <= 3 && !placed; retry += 1) {
      const side = retry % 2 === 0 ? -1 : 1
      placed = spawnCrowdObject(state, view, kind, {
        angle: groupAngle + side * retry * 0.2,
        distance: Math.min(96, distance + retry * 8),
      }, true)
    }
  }
}

/** Fill the opening's distant crowd slots before the first rendered frame. */
export function primeCrowds(state: CrowdState, view: CrowdView) {
  if (state.initialSpawnDone) return state
  state.initialSpawnDone = true
  seedInitialCrowd(state, view, !view.tutorialCatOnly)
  state.spawnTimer = 0.16
  return state
}

export function stepCrowds(state: CrowdState, view: CrowdView, dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  state.spawnTimer -= d
  if (!state.initialSpawnDone) {
    // Seed a healthy recovery supply immediately. Any supplied object (the
    // tutorial cat or a restored save) is retained and the missing slots fill
    // around it instead of making the opening city wait for an absorption.
    primeCrowds(state, view)
  }
  let pedestrians = 0
  let cats = 0
  let nearbyPedestrians = 0
  let recycled = 0
  for (const object of state.objects) {
    if (!object.active) continue
    // Hot reloads and saved runs can contain a crowd slot that was created
    // before the lake boundary existed. Remove it before movement so a stale
    // actor cannot remain stranded on a water tile or keep walking along an
    // internal lake seam.
    if (!crowdPositionIsWalkable(object.position)) {
      object.active = false
      object.inBeam = false
      object.tether = 0
      recycled += 1
      continue
    }
    if (object.absorbing) {
      object.absorbTimer = Math.max(0, object.absorbTimer - d)
      if (object.absorbTimer <= 0) {
        object.active = false
        object.absorbing = false
        state.spawnTimer = Math.max(state.spawnTimer, 0.16)
      }
      continue
    }
    object.wasVisible ||= crowdObjectIsVisible(object.position, view)
    // The opening target is deliberately the one quiet cat in the city. It
    // must not panic and wander away before the player gets the first beam
    // prompt, while every later cat uses the normal movement simulation.
    if (object.id.startsWith('tutorial-cat')) {
      cats += 1
      continue
    }
    if (object.kind === 'pedestrian') pedestrians += 1
    else cats += 1
    const dx = object.position.x - view.position.x
    const dz = object.position.z - view.position.z
    const distance = Math.hypot(dx, dz)
    if (object.kind === 'pedestrian' && distance <= 48) nearbyPedestrians += 1
    if (!object.inBeam && object.tether <= 0.02 && object.position.y <= 0.72) {
      let threatDistance = distance
      let fleeDx = dx
      let fleeDz = dz
      // Threats only affect the short flee rings. Far bodies keep their calm
      // destination walk without paying an O(objects × threats) scan every
      // frame now that the fixed pool is 80 actors.
      if (view.threats && distance < 42) {
        // Crowd entries sit at the tail of the shared threat array. Skipping
        // them stops two pedestrians from panicking each other forever.
        const threatCount = view.crowdThreatStart ?? view.threats.length
        for (let threatIndex = 0; threatIndex < threatCount; threatIndex += 1) {
          const threat = view.threats[threatIndex]
          if (!threat) continue
          const threatDx = object.position.x - threat.x
          const threatDz = object.position.z - threat.z
          const candidateDistance = Math.hypot(threatDx, threatDz)
          if (candidateDistance < threatDistance) {
            threatDistance = candidateDistance
            fleeDx = threatDx
            fleeDz = threatDz
          }
        }
      }
      // Hysteresis: the trigger ring widens once already fleeing, so hovering
      // right at the threshold cannot toggle the state every frame.
      const wasFleeing = object.fleeTimer > 0
      const trigger = wasFleeing ? FLEE_EXIT_DISTANCE[object.kind] : FLEE_ENTER_DISTANCE[object.kind]
      if (threatDistance < trigger) object.fleeTimer = FLEE_HOLD_TIME
      else object.fleeTimer = Math.max(0, object.fleeTimer - d)
      object.pauseTimer = Math.max(0, object.pauseTimer - d)
      object.turnCooldown = Math.max(0, object.turnCooldown - d)
      if (object.fleeTimer > 0) {
        const inverse = 1 / Math.max(0.001, threatDistance)
        const speed = FLEE_SPEED[object.kind]
        const blend = 1 - Math.exp(-FLEE_BLEND * d)
        object.velocity.x += (fleeDx * inverse * speed - object.velocity.x) * blend
        object.velocity.z += (fleeDz * inverse * speed - object.velocity.z) * blend
        object.heading = Math.atan2(object.velocity.x, object.velocity.z)
        object.wanderTimer = 0.8
        object.pauseTimer = 0
      } else if (object.pauseTimer > 0) {
        object.velocity.x *= Math.exp(-8 * d)
        object.velocity.z *= Math.exp(-8 * d)
      } else if (!object.roams) {
        object.wanderTimer -= d
        const toTargetX = object.targetX - object.position.x
        const toTargetZ = object.targetZ - object.position.z
        if (Math.hypot(toTargetX, toTargetZ) < DESTINATION_ARRIVE || object.wanderTimer <= 0) {
          pickDestination(state, object)
          if (random(state) < 0.18) object.pauseTimer = 0.4 + random(state) * 1.1
        } else object.heading = Math.atan2(toTargetX, toTargetZ)
        const speed = WANDER_SPEED[object.kind]
        const blend = 1 - Math.exp(-WANDER_BLEND * d)
        object.velocity.x += (Math.sin(object.heading) * speed - object.velocity.x) * blend
        object.velocity.z += (Math.cos(object.heading) * speed - object.velocity.z) * blend
      } else {
        object.wanderTimer -= d
        if (object.wanderTimer <= 0) {
          object.heading += object.kind === 'cat'
            ? (random(state) - 0.5) * 2.4
            : (random(state) < 0.5 ? -1 : 1) * Math.PI / 2
          object.wanderTimer = 1.2 + random(state) * 3.5
          if (random(state) < (object.kind === 'cat' ? 0.3 : 0.16)) object.pauseTimer = 0.35 + random(state) * 0.9
        }
        const speed = WANDER_SPEED[object.kind]
        const blend = 1 - Math.exp(-WANDER_BLEND * d)
        object.velocity.x += (Math.sin(object.heading) * speed - object.velocity.x) * blend
        object.velocity.z += (Math.cos(object.heading) * speed - object.velocity.z) * blend
      }
      object.rotation.y = object.heading
      // Resolve each axis on its own so a body pressed against a wall slides
      // along it. Zeroing both axes and flipping the heading every frame is
      // what made fleeing crowds vibrate in place.
      const nextX = object.position.x + object.velocity.x * d
      const nextZ = object.position.z + object.velocity.z * d
      let blockedX = false
      let blockedZ = false
      // The city collider list is capped at 128 buildings. Bodies outside the
      // local street band are still simulated, but defer wall checks until
      // they approach the player; this keeps the larger crowd pool from
      // turning every frame into a full pool × collider sweep.
      // Water is a real movement boundary for pedestrians and cats. Resolving
      // each axis independently lets them follow the shore instead of walking
      // diagonally across a lake or vibrating at its edge.
      if (!crowdPositionIsWalkable({ x: nextX, z: object.position.z })) blockedX = true
      if (!crowdPositionIsWalkable({ x: object.position.x, z: nextZ })) blockedZ = true
      // Axis checks alone allow a diagonal corner cut when both intermediate
      // points are dry but the combined next point enters a lake tile.
      if (!crowdPositionIsWalkable({ x: nextX, z: nextZ }) && !blockedX && !blockedZ) {
        blockedX = true
        blockedZ = true
      }
      if (view.colliders && distance < 120) {
        for (const collider of view.colliders) {
          const spanX = object.position.x > collider.minX - COLLIDER_MARGIN && object.position.x < collider.maxX + COLLIDER_MARGIN
          const spanZ = object.position.z > collider.minZ - COLLIDER_MARGIN && object.position.z < collider.maxZ + COLLIDER_MARGIN
          const nextSpanX = nextX > collider.minX - COLLIDER_MARGIN && nextX < collider.maxX + COLLIDER_MARGIN
          const nextSpanZ = nextZ > collider.minZ - COLLIDER_MARGIN && nextZ < collider.maxZ + COLLIDER_MARGIN
          if (!blockedX && nextSpanX && spanZ) blockedX = true
          if (!blockedZ && spanX && nextSpanZ) blockedZ = true
          if (blockedX && blockedZ) break
        }
      }
      if (blockedX || blockedZ) {
        // Sliding alone does nothing when the approach is head-on, because the
        // tangential component is zero. Commit to one side for as long as the
        // wall is in the way so the body walks around it instead of stalling.
        if (object.slideDirection === 0) object.slideDirection = random(state) < 0.5 ? -1 : 1
        const push = object.fleeTimer > 0 ? FLEE_SPEED[object.kind] : WANDER_SPEED[object.kind]
        if (blockedX) {
          object.velocity.x = 0
          if (!blockedZ && Math.abs(object.velocity.z) < push * 0.5) object.velocity.z = object.slideDirection * push
        }
        if (blockedZ) {
          object.velocity.z = 0
          if (!blockedX && Math.abs(object.velocity.x) < push * 0.5) object.velocity.x = object.slideDirection * push
        }
      } else object.slideDirection = 0
      // Integrate after the velocity fix-up, not from the pre-resolution
      // nextX/nextZ, so a slide push actually moves the body this frame.
      object.position.x += object.velocity.x * d
      object.position.z += object.velocity.z * d
      if (blockedX && blockedZ && object.turnCooldown <= 0) {
        // Wedged into a corner: pick a new heading, but only on a cooldown so
        // this cannot become a per-frame direction flip.
        object.heading += Math.PI * (0.5 + random(state) * 0.5) * (random(state) < 0.5 ? -1 : 1)
        object.turnCooldown = TURN_COOLDOWN
        object.wanderTimer = Math.min(object.wanderTimer, 0.4)
      }
    }
    if (!object.inBeam && object.tether <= 0.02 && distance > CROWD_REMOVE_DISTANCE) {
      object.active = false
      recycled += 1
    }
  }
  state.nearbyPedestrians = nearbyPedestrians

  if (state.spawnTimer <= 0) {
    let spawned = 0
    const refill = Math.max(1, Math.min(3, recycled + 1))
    for (let attempt = 0; attempt < refill; attempt += 1) {
      const preferPedestrian = pedestrians < PEDESTRIAN_MAX && (cats >= CAT_MAX || random(state) < 0.8)
      if (!spawnCrowdObject(state, view, preferPedestrian ? 'pedestrian' : 'cat')) break
      if (preferPedestrian) pedestrians += 1
      else cats += 1
      spawned += 1
    }
    state.spawnTimer = spawned > 0 ? 0.05 : 0.14
  }
  return state
}

export function beginNearbyCrowdAbsorption(state: CrowdState, ufoPosition: Vec3, reach = CROWD_ABSORB_DISTANCE) {
  return beginNearbyBeamObjectAbsorption(state.objects, ufoPosition, Number.POSITIVE_INFINITY, reach) as CrowdObject | null
}

export function activeCrowdCount(state: CrowdState, kind?: CrowdKind) {
  let count = 0
  for (const object of state.objects) if (object.active && (!kind || object.kind === kind)) count += 1
  return count
}

import { BEAM_ABSORB_TIME, beginNearbyBeamObjectAbsorption, type BeamObject } from './beam'
import type { CrowdSpawnZone } from './cityLandmarks'
import type { Aabb, Vec3 } from './drone'

export type CrowdKind = 'pedestrian' | 'cat'
export const PEDESTRIAN_MAX = 42
export const CAT_MAX = 11
export const INITIAL_PEDESTRIANS = 24
export const INITIAL_CATS = 9
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
export const CAT_MASS = 0.2
export const PEDESTRIAN_MASS = 0.56

export const CROWD_REMOVE_DISTANCE = 185
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
const SPAWN_ATTEMPTS = 6
// Respawns land in the arc the player is flying into.
//
// They used to appear directly behind, so a player flying a straight line
// outran the entire crowd supply and never met a new body. Ringing them evenly
// was no better: only about three percent of a full circle falls inside the
// beam corridor, which measured out at four catches per pass - exactly what the
// geometry predicts.
//
// The arc is wide enough that people still arrive from the flanks and steering
// toward them beats flying straight, and far enough out that arrivals are
// masked by the city rather than popping in.
const RESPAWN_MIN_DISTANCE = 92
const RESPAWN_RANGE = 62
const RESPAWN_ARC = 1.75
/**
 * Bodies arrive in knots rather than evenly sprinkled.
 *
 * Spread evenly, a crowd is background texture: there is nowhere better to fly
 * than anywhere else. Clustered, a gathering is visible from a distance and on
 * the radar, so choosing where to go becomes a decision instead of drifting.
 */
const CLUSTER_SIZE = 5
const CLUSTER_SPREAD = 11
const GOLDEN_ANGLE = 2.399963

export type CrowdObject = BeamObject & {
  kind: CrowdKind
  slot: number
  generation: number
  heading: number
  wanderTimer: number
  pauseTimer: number
  fleeTimer: number
  turnCooldown: number
  slideDirection: number
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
}

export type CrowdView = {
  position: Vec3
  heading: number
  colliders?: readonly Aabb[]
  threats?: readonly Vec3[]
  crowdThreatStart?: number
  spawnZones?: readonly CrowdSpawnZone[]
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
    wanderTimer: 0,
    pauseTimer: 0,
    fleeTimer: 0,
    turnCooldown: 0,
    slideDirection: 0,
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
  }
}

function random(state: CrowdState) {
  let value = state.randomState || 1
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  state.randomState = value >>> 0
  return state.randomState / 0xffffffff
}

function blockedAt(view: CrowdView, x: number, z: number, margin: number) {
  if (!view.colliders) return false
  for (const collider of view.colliders) {
    if (x > collider.minX - margin && x < collider.maxX + margin && z > collider.minZ - margin && z < collider.maxZ + margin) return true
  }
  return false
}

type CrowdPlacement = { angle: number; distance: number } | { x: number; z: number; radius: number }

// The run-start seed and the steady-state respawn want different placements:
// seeding scatters the whole ring around the player so the city looks alive in
// every direction, while respawns stay behind the view so nothing pops in.
function spawnCrowdObject(state: CrowdState, view: CrowdView, kind: CrowdKind, placement?: CrowdPlacement) {
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
          const matches = zones.filter((candidate) => candidate.kind === wantedKind)
          zone = matches[Math.floor(random(state) * matches.length)]
        }
        if (zone) {
          state.clusterX = zone.x
          state.clusterZ = zone.z
          state.clusterLeft = zone.kind === 'park' ? 8 : 3
        } else {
          const angle = view.heading + (random(state) - 0.5) * RESPAWN_ARC
          const distance = RESPAWN_MIN_DISTANCE + random(state) * RESPAWN_RANGE
          state.clusterX = view.position.x + Math.sin(angle) * distance
          state.clusterZ = view.position.z + Math.cos(angle) * distance
          state.clusterLeft = CLUSTER_SIZE
        }
      }
      const jitter = CLUSTER_SPREAD * (0.4 + attempt * 0.5)
      x = state.clusterX + (random(state) - 0.5) * jitter
      z = state.clusterZ + (random(state) - 0.5) * jitter
    }
    if (!blockedAt(view, x, z, SPAWN_CLEARANCE)) { placed = true; break }
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
  object.wanderTimer = 1 + random(state) * 3
  object.pauseTimer = 0
  object.fleeTimer = 0
  object.turnCooldown = 0
  object.slideDirection = 0
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

// Golden-angle stepping spreads the seed evenly over the full circle; plain
// random angles clump badly at these counts.
function seedInitialCrowd(state: CrowdState, view: CrowdView) {
  const total = INITIAL_PEDESTRIANS + INITIAL_CATS
  const parks = view.spawnZones?.filter((zone) => zone.kind === 'park') ?? []
  const parkingLots = view.spawnZones?.filter((zone) => zone.kind === 'parking-lot') ?? []
  let seededPeople = 0
  for (let index = 0; index < total; index += 1) {
    const kind: CrowdKind = index % 3 === 2 && index / 3 < INITIAL_CATS ? 'cat' : 'pedestrian'
    state.seedAngle += GOLDEN_ANGLE
    const distance = 20 + (index / Math.max(1, total - 1)) * 70
    const facility = kind === 'pedestrian' && parks.length > 0 && seededPeople < 16
      ? parks[seededPeople % parks.length]
      : kind === 'pedestrian' && parkingLots.length > 0 && seededPeople < 20
        ? parkingLots[seededPeople % parkingLots.length]
        : null
    if (kind === 'pedestrian') seededPeople += 1
    const placement = facility
      ? { x: facility.x, z: facility.z, radius: facility.kind === 'park' ? 12 : 7 }
      : { angle: state.seedAngle, distance }
    if (!spawnCrowdObject(state, view, kind, placement)) {
      spawnCrowdObject(state, view, kind === 'cat' ? 'pedestrian' : 'cat', { angle: state.seedAngle, distance })
    }
  }
}

export function stepCrowds(state: CrowdState, view: CrowdView, dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  state.spawnTimer -= d
  if (!state.initialSpawnDone) {
    // Seed a healthy recovery supply immediately. If a caller already supplied
    // an active object (for example while restoring a save), preserve it and
    // let the normal cadence take over instead of doubling the crowd.
    const hasActiveCrowd = state.objects.some((object) => object.active)
    state.initialSpawnDone = true
    if (!hasActiveCrowd) seedInitialCrowd(state, view)
    state.spawnTimer = 0.16
  }
  let pedestrians = 0
  let cats = 0
  let nearbyPedestrians = 0
  for (const object of state.objects) {
    if (!object.active) continue
    if (object.absorbing) {
      object.absorbTimer = Math.max(0, object.absorbTimer - d)
      if (object.absorbTimer <= 0) {
        object.active = false
        object.absorbing = false
        state.spawnTimer = Math.max(state.spawnTimer, 0.16)
      }
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
      if (view.threats) {
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
      if (view.colliders) {
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
    if (!object.inBeam && object.tether <= 0.02 && distance > CROWD_REMOVE_DISTANCE) object.active = false
  }
  state.nearbyPedestrians = nearbyPedestrians

  if (state.spawnTimer <= 0) {
    const preferPedestrian = pedestrians < PEDESTRIAN_MAX && (cats >= CAT_MAX || random(state) < 0.84)
    const spawned = spawnCrowdObject(state, view, preferPedestrian ? 'pedestrian' : 'cat')
    state.spawnTimer = spawned ? 0.16 : 0.35
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

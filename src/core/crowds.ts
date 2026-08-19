import type { BeamObject } from './beam'
import type { Aabb, Vec3 } from './drone'

export type CrowdKind = 'pedestrian' | 'cat'
export const PEDESTRIAN_MAX = 28
export const CAT_MAX = 7
export const CROWD_REMOVE_DISTANCE = 155
export const CROWD_ABSORB_DISTANCE = 3.35
export const CROWD_ABSORB_TIME = 0.24

export type CrowdObject = BeamObject & {
  kind: CrowdKind
  slot: number
  generation: number
  heading: number
  wanderTimer: number
  pauseTimer: number
  fleeTimer: number
}

export type CrowdState = {
  objects: CrowdObject[]
  spawnTimer: number
  randomState: number
  nearbyPedestrians: number
}

export type CrowdView = {
  position: Vec3
  heading: number
  colliders?: readonly Aabb[]
  threats?: readonly Vec3[]
  crowdThreatStart?: number
}

function makeCrowdObject(kind: CrowdKind, slot: number): CrowdObject {
  return {
    id: `crowd:${kind}:${slot}:0`,
    kind,
    slot,
    generation: 0,
    mass: kind === 'cat' ? 0.1 : 0.28,
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
    heading: 0,
    wanderTimer: 0,
    pauseTimer: 0,
    fleeTimer: 0,
  }
}

export function createCrowdState(seed = 0xc47cafe): CrowdState {
  const objects: CrowdObject[] = []
  for (let slot = 0; slot < PEDESTRIAN_MAX; slot += 1) objects.push(makeCrowdObject('pedestrian', slot))
  for (let slot = 0; slot < CAT_MAX; slot += 1) objects.push(makeCrowdObject('cat', slot))
  return { objects, spawnTimer: 0, randomState: seed >>> 0 || 1, nearbyPedestrians: 0 }
}

function random(state: CrowdState) {
  let value = state.randomState || 1
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  state.randomState = value >>> 0
  return state.randomState / 0xffffffff
}

function spawnCrowdObject(state: CrowdState, view: CrowdView, kind: CrowdKind) {
  let object: CrowdObject | null = null
  for (const candidate of state.objects) {
    if (!candidate.active && candidate.kind === kind) { object = candidate; break }
  }
  if (!object) return false
  const distance = 34 + random(state) * 42
  const angle = view.heading + Math.PI + (random(state) - 0.5) * 1.65
  object.generation += 1
  object.id = `crowd:${kind}:${object.slot}:${object.generation}`
  object.position.x = view.position.x + Math.sin(angle) * distance
  object.position.y = 0.65
  object.position.z = view.position.z + Math.cos(angle) * distance
  object.heading = kind === 'pedestrian'
    ? Math.round(random(state) * 4) * Math.PI / 2
    : random(state) * Math.PI * 2
  object.rotation.x = 0
  object.rotation.y = object.heading
  object.rotation.z = 0
  object.velocity.x = Math.sin(object.heading) * (kind === 'cat' ? 2.4 : 1.75)
  object.velocity.y = 0
  object.velocity.z = Math.cos(object.heading) * (kind === 'cat' ? 2.4 : 1.75)
  object.angularVelocity.x = 0
  object.angularVelocity.y = 0
  object.angularVelocity.z = 0
  object.wanderTimer = 1 + random(state) * 3
  object.pauseTimer = 0
  object.fleeTimer = 0
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

export function stepCrowds(state: CrowdState, view: CrowdView, dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  state.spawnTimer -= d
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
        const selfThreatIndex = (view.crowdThreatStart ?? -1) + (object.kind === 'cat' ? PEDESTRIAN_MAX + object.slot : object.slot)
        for (let threatIndex = 0; threatIndex < view.threats.length; threatIndex += 1) {
          if (threatIndex === selfThreatIndex) continue
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
      const fleeing = threatDistance < (object.kind === 'cat' ? 20 : 14)
      if (fleeing) object.fleeTimer = 0.9
      else object.fleeTimer = Math.max(0, object.fleeTimer - d)
      object.pauseTimer = Math.max(0, object.pauseTimer - d)
      if (fleeing) {
        const inverse = 1 / Math.max(0.001, threatDistance)
        const speed = object.kind === 'cat' ? 11 : 7.5
        object.velocity.x = fleeDx * inverse * speed
        object.velocity.z = fleeDz * inverse * speed
        object.heading = Math.atan2(object.velocity.x, object.velocity.z)
        object.wanderTimer = 0.8
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
        const speed = object.kind === 'cat' ? 2.35 : 1.7
        const blend = 1 - Math.exp(-4 * d)
        object.velocity.x += (Math.sin(object.heading) * speed - object.velocity.x) * blend
        object.velocity.z += (Math.cos(object.heading) * speed - object.velocity.z) * blend
      }
      object.rotation.y = object.heading
      const nextX = object.position.x + object.velocity.x * d
      const nextZ = object.position.z + object.velocity.z * d
      let blocked = false
      if (view.colliders) {
        for (const collider of view.colliders) {
          if (nextX > collider.minX - 0.55 && nextX < collider.maxX + 0.55 && nextZ > collider.minZ - 0.55 && nextZ < collider.maxZ + 0.55) {
            blocked = true
            break
          }
        }
      }
      if (blocked) {
        object.heading += Math.PI * (random(state) < 0.5 ? 0.5 : -0.5)
        object.velocity.x = 0
        object.velocity.z = 0
      } else {
        object.position.x = nextX
        object.position.z = nextZ
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

export function beginNearbyCrowdAbsorption(state: CrowdState, ufoPosition: Vec3) {
  for (const object of state.objects) {
    if (!object.active || object.absorbing || !object.inBeam) continue
    const distance = Math.hypot(
      object.position.x - ufoPosition.x,
      object.position.y - ufoPosition.y,
      object.position.z - ufoPosition.z,
    )
    if (distance > CROWD_ABSORB_DISTANCE) continue
    object.absorbing = true
    object.absorbTimer = CROWD_ABSORB_TIME
    object.inBeam = false
    object.velocity.x = 0
    object.velocity.y = 0
    object.velocity.z = 0
    object.angularVelocity.x = 0
    object.angularVelocity.y = 0
    object.angularVelocity.z = 0
    return object
  }
  return null
}

export function activeCrowdCount(state: CrowdState, kind?: CrowdKind) {
  let count = 0
  for (const object of state.objects) if (object.active && (!kind || object.kind === kind)) count += 1
  return count
}

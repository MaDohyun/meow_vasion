import type { Vec3 } from './drone'

export type BeamObjectKind = 'car' | 'pedestrian' | 'cat'

export type BeamObject = {
  id: string
  kind: BeamObjectKind
  mass: number
  color: string
  position: Vec3
  velocity: Vec3
  rotation: Vec3
  angularVelocity: Vec3
  active: boolean
  inBeam: boolean
  tether: number
  playerTouched: boolean
  destroying: boolean
  destroyTimer: number
  explosionPending: boolean
  absorbing: boolean
  absorbTimer: number
}

export type BeamField = {
  active: boolean
  boosting: boolean
  position: Vec3
  velocity: Vec3
  radiusScale?: number
}

export type BeamProfile = {
  maxDrop: number
  baseRadius: number
  coneSpread: number
  spring: number
  response: number
}

const GROUND_HEIGHT = 0.65
export const BEAM_MIN_GRIP = 0.11
export const BEAM_GRIP_EXPONENT = 2.8

export function beamProfile(boosting: boolean, radiusScale = 1): BeamProfile {
  const scale = Math.max(0.1, radiusScale)
  // Widened for the growth loop: the beam is the only verb, so a pass over a
  // street has to actually sweep it rather than thread a needle.
  const profile = boosting
    ? { maxDrop: 56, baseRadius: 8.2, coneSpread: 0.34, spring: 25.5, response: 58 }
    : { maxDrop: 36, baseRadius: 5.8, coneSpread: 0.27, spring: 15.6, response: 32 }
  return {
    ...profile,
    baseRadius: profile.baseRadius * scale,
    coneSpread: profile.coneSpread * scale,
  }
}

export function beamVisualLength(droneHeight: number, maxDrop: number, groundHeight = 0.15) {
  return Math.max(0, Math.min(maxDrop, droneHeight - groundHeight))
}

function hashId(id: string) {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function isInsideBeam(object: Pick<BeamObject, 'position'>, field: BeamField) {
  if (!field.active) return false
  const profile = beamProfile(field.boosting, field.radiusScale)
  const drop = field.position.y - object.position.y
  if (drop < -0.5 || drop > profile.maxDrop) return false
  const radius = profile.baseRadius + Math.max(0, drop) * profile.coneSpread
  return Math.hypot(object.position.x - field.position.x, object.position.z - field.position.z) <= radius
}

export function beamGrip(drop: number, maxDrop: number, minGrip = BEAM_MIN_GRIP, exponent = BEAM_GRIP_EXPONENT) {
  const dropRatio = Math.max(0, Math.min(1, drop / Math.max(0.001, maxDrop)))
  return minGrip + (1 - minGrip) * Math.pow(1 - dropRatio, Math.max(2, exponent))
}

export function beginCarDestruction(object: BeamObject, direction: Vec3, inheritedVelocity: Vec3) {
  if (!object.active || object.kind !== 'car' || object.destroying) return false
  object.destroying = true
  object.destroyTimer = 0.52
  object.explosionPending = true
  object.inBeam = false
  object.tether = 0
  object.playerTouched = true
  object.velocity.x = direction.x * 31 + inheritedVelocity.x * 0.22
  object.velocity.y = direction.y * 31 + inheritedVelocity.y * 0.08 + 10
  object.velocity.z = direction.z * 31 + inheritedVelocity.z * 0.22
  const spin = object.id.length % 2 === 0 ? 1 : -1
  object.angularVelocity.x = spin * 9
  object.angularVelocity.y = spin * 13
  object.angularVelocity.z = -spin * 7
  return true
}

export function stepBeamObjects(objects: BeamObject[], field: BeamField, dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  const profile = beamProfile(field.boosting, field.radiusScale)

  for (const object of objects) {
    if (!object.active) continue
    if (object.absorbing) continue
    if (object.destroying) {
      object.destroyTimer = Math.max(0, object.destroyTimer - d)
      object.velocity.y -= 7.5 * d
      object.position.x += object.velocity.x * d
      object.position.y += object.velocity.y * d
      object.position.z += object.velocity.z * d
      object.rotation.x += object.angularVelocity.x * d
      object.rotation.y += object.angularVelocity.y * d
      object.rotation.z += object.angularVelocity.z * d
      if (object.destroyTimer <= 0) {
        object.destroying = false
        object.active = false
        object.inBeam = false
        object.tether = 0
      }
      continue
    }
    const captured = isInsideBeam(object, field)
    object.inBeam = captured

    if (captured) {
      object.playerTouched = true
      const mass = Math.max(0.08, object.mass)
      const drop = Math.max(0, field.position.y - object.position.y)
      const grip = beamGrip(drop, profile.maxDrop)
      const spring = profile.spring * grip / mass
      const hash = hashId(object.id)
      const slot = hash % 11
      const angle = (hash % 360) * Math.PI / 180
      const orbit = 0.6 + (slot % 4) * 0.28
      const layer = slot % 3
      const anchor = {
        x: field.position.x + Math.cos(angle) * orbit,
        y: Math.max(GROUND_HEIGHT + 0.8, field.position.y - 1.8 - layer * 0.48),
        z: field.position.z + Math.sin(angle) * orbit,
      }
      const verticalLimit = profile.maxDrop * 0.34
      const verticalOffset = Math.max(-verticalLimit, Math.min(verticalLimit, anchor.y - object.position.y))
      const desired = {
        x: field.velocity.x + (anchor.x - object.position.x) * spring,
        y: field.velocity.y + verticalOffset * spring * grip,
        z: field.velocity.z + (anchor.z - object.position.z) * spring,
      }
      if (anchor.y > object.position.y) desired.y = Math.max(desired.y, 0.9)
      const responseGrip = 0.28 + Math.sqrt(grip) * 0.72
      const blend = 1 - Math.exp(-(profile.response * responseGrip / mass) * d)
      object.velocity.x += (desired.x - object.velocity.x) * blend
      object.velocity.y += (desired.y - object.velocity.y) * blend
      object.velocity.z += (desired.z - object.velocity.z) * blend
      object.tether = Math.min(1, object.tether + d * (field.boosting ? 7 : 4) * (0.15 + grip * 0.85))
      const direction = hash % 2 === 0 ? 1 : -1
      const wriggle = 1.15 + Math.sqrt(mass) * 0.48
      object.angularVelocity.x += (direction * 1.4 * wriggle - object.angularVelocity.x) * blend
      object.angularVelocity.y += (direction * (field.boosting ? 2.8 : 1.7) * wriggle - object.angularVelocity.y) * blend
      object.angularVelocity.z += (Math.sin(angle) * 1.6 * wriggle - object.angularVelocity.z) * blend
    } else {
      object.tether = Math.max(0, object.tether - d * 3.5)
      object.velocity.y -= 9.8 * d
    }

    object.position.x += object.velocity.x * d
    object.position.y += object.velocity.y * d
    object.position.z += object.velocity.z * d
    object.rotation.x += object.angularVelocity.x * d
    object.rotation.y += object.angularVelocity.y * d
    object.rotation.z += object.angularVelocity.z * d

    if (object.position.y < GROUND_HEIGHT) {
      object.position.y = GROUND_HEIGHT
      object.velocity.y = Math.abs(object.velocity.y) * 0.18
      const groundFriction = Math.pow(0.72, d * 60)
      object.velocity.x *= groundFriction
      object.velocity.z *= groundFriction
      object.angularVelocity.x *= groundFriction
      object.angularVelocity.y *= Math.pow(0.86, d * 60)
      object.angularVelocity.z *= groundFriction
      if (!captured) {
        object.rotation.x *= Math.pow(0.5, d * 60)
        object.rotation.z *= Math.pow(0.5, d * 60)
      }
    }
  }

  separateTouchedBeamObjects(objects)

  return objects
}

function separateTouchedBeamObjects(objects: BeamObject[]) {
  const minimumDistance = 2.15
  for (let leftIndex = 0; leftIndex < objects.length; leftIndex += 1) {
    const left = objects[leftIndex]!
    if (!left.active || left.destroying || !left.playerTouched) continue
    for (let rightIndex = leftIndex + 1; rightIndex < objects.length; rightIndex += 1) {
      const right = objects[rightIndex]!
      if (!right.active || right.destroying || !right.playerTouched) continue
      const dx = right.position.x - left.position.x
      const dy = right.position.y - left.position.y
      const dz = right.position.z - left.position.z
      const distance = Math.hypot(dx, dy, dz)
      if (distance >= minimumDistance) continue
      const safeDistance = Math.max(0.001, distance)
      const nx = distance < 0.001 ? 1 : dx / safeDistance
      const ny = distance < 0.001 ? 0 : dy / safeDistance
      const nz = distance < 0.001 ? 0 : dz / safeDistance
      const inverseLeft = 1 / Math.max(0.08, left.mass)
      const inverseRight = 1 / Math.max(0.08, right.mass)
      const inverseTotal = inverseLeft + inverseRight
      const overlap = minimumDistance - distance
      const leftShare = inverseLeft / inverseTotal
      const rightShare = inverseRight / inverseTotal
      left.position.x -= nx * overlap * leftShare
      left.position.y -= ny * overlap * leftShare
      left.position.z -= nz * overlap * leftShare
      right.position.x += nx * overlap * rightShare
      right.position.y += ny * overlap * rightShare
      right.position.z += nz * overlap * rightShare
      const relativeVelocity = (right.velocity.x - left.velocity.x) * nx + (right.velocity.y - left.velocity.y) * ny + (right.velocity.z - left.velocity.z) * nz
      if (relativeVelocity < 0) {
        const impulse = -relativeVelocity * 0.62 / inverseTotal
        left.velocity.x -= nx * impulse * inverseLeft
        left.velocity.y -= ny * impulse * inverseLeft
        left.velocity.z -= nz * impulse * inverseLeft
        right.velocity.x += nx * impulse * inverseRight
        right.velocity.y += ny * impulse * inverseRight
        right.velocity.z += nz * impulse * inverseRight
      }
      const spin = 0.45 + overlap * 0.9
      left.angularVelocity.z -= spin * rightShare
      right.angularVelocity.z += spin * leftShare
    }
  }
}

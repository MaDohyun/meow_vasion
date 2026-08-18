import type { Vec3 } from './drone'

export type BeamObjectKind = 'car'

export type BeamObject = {
  id: string
  kind: BeamObjectKind
  color: string
  position: Vec3
  velocity: Vec3
  rotation: Vec3
  angularVelocity: Vec3
  inBeam: boolean
  tether: number
}

export type BeamField = {
  active: boolean
  boosting: boolean
  position: Vec3
  velocity: Vec3
}

export type BeamProfile = {
  maxDrop: number
  baseRadius: number
  coneSpread: number
  spring: number
  response: number
}

const GROUND_HEIGHT = 0.65

export function beamProfile(boosting: boolean): BeamProfile {
  return boosting
    ? { maxDrop: 30, baseRadius: 7.2, coneSpread: 0.36, spring: 8.5, response: 22 }
    : { maxDrop: 18, baseRadius: 4.2, coneSpread: 0.25, spring: 5.2, response: 10 }
}

function hashId(id: string) {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function isInsideBeam(object: BeamObject, field: BeamField) {
  if (!field.active) return false
  const profile = beamProfile(field.boosting)
  const drop = field.position.y - object.position.y
  if (drop < -0.5 || drop > profile.maxDrop) return false
  const radius = profile.baseRadius + Math.max(0, drop) * profile.coneSpread
  return Math.hypot(object.position.x - field.position.x, object.position.z - field.position.z) <= radius
}

export function stepBeamObjects(objects: BeamObject[], field: BeamField, dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  const profile = beamProfile(field.boosting)

  for (const object of objects) {
    const captured = isInsideBeam(object, field)
    object.inBeam = captured

    if (captured) {
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
      const desired = {
        x: field.velocity.x + (anchor.x - object.position.x) * profile.spring,
        y: field.velocity.y + (anchor.y - object.position.y) * profile.spring,
        z: field.velocity.z + (anchor.z - object.position.z) * profile.spring,
      }
      const blend = 1 - Math.exp(-profile.response * d)
      object.velocity.x += (desired.x - object.velocity.x) * blend
      object.velocity.y += (desired.y - object.velocity.y) * blend
      object.velocity.z += (desired.z - object.velocity.z) * blend
      object.tether = Math.min(1, object.tether + d * (field.boosting ? 7 : 4))
      const direction = hash % 2 === 0 ? 1 : -1
      object.angularVelocity.x += (direction * 1.4 - object.angularVelocity.x) * blend
      object.angularVelocity.y += (direction * (field.boosting ? 2.8 : 1.7) - object.angularVelocity.y) * blend
      object.angularVelocity.z += (Math.sin(angle) * 1.6 - object.angularVelocity.z) * blend
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

  return objects
}

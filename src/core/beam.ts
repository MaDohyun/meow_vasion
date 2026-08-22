import type { Aabb, Vec3 } from './drone'

export type BeamObjectKind =
  | 'car' | 'truck' | 'pedestrian' | 'cat' | 'explosive' | 'building'
  | 'drone' | 'police' | 'police-car' | 'helicopter' | 'soldier'
  | 'fighter' | 'anti-air' | 'tank' | 'boss'

export const BEAM_ABSORB_TIME = 0.24

/**
 * Seconds of grip left after the beam is cut.
 *
 * Short: cutting the beam is how you drop a load, and it has to work at once.
 * While the beam is on, though, the grip does not lapse at all - what it
 * catches it keeps. That is the rule that makes a weak beam usable at speed:
 * a pedestrian is inside the opening saucer's cone for about a third of a
 * second at cruise, while the haul takes a couple, so a grip that expired
 * would mean nothing could ever be picked up while flying - only while
 * hovering, which is not this game. Snag them in passing and drag them up as
 * you go.
 *
 * The cost of keeping hold is the point: everything you catch hangs off you
 * and slows you down until you eat it or dump it.
 */
export const BEAM_HOLD_TIME = 0.35

/**
 * A car's mass, which is really its stay on the beam.
 *
 * Rise speed divides by mass, so this is the dial for how long something hangs
 * under the craft. At the old value a car was swallowed almost the moment it
 * was caught, which meant beam ballast - the only speed penalty in the game -
 * was charged for about a second and never actually felt. Tripled, a car is a
 * load you fly with and have to decide whether to keep.
 */
export const CAR_MASS = 3

const DEFAULT_DIAMETER: Record<BeamObjectKind, number> = {
  // Buildings always carry their own measured bulk; this is only a fallback.
  building: 18,
  cat: 0.55,
  pedestrian: 0.78,
  police: 1.35,
  soldier: 1.55,
  drone: 1.6,
  car: 2.9,
  'police-car': 3.2,
  truck: 4.2,
  fighter: 4.4,
  helicopter: 4.6,
  tank: 4.8,
  explosive: 5.1,
  'anti-air': 5.2,
  // The battleship's beam width. Only a fallback - it is excluded by kind
  // below, so this figure never decides anything.
  boss: 16,
}

/** Building-mounted anti-air emplacements and the battleship are the beam
 *  objects treated as architecture. Everything else is eligible once it is no
 *  wider than a third of the current UFO diameter. */
export function isAbsorbable(kind: BeamObjectKind, diameter = DEFAULT_DIAMETER[kind], maxDiameter = Number.POSITIVE_INFINITY) {
  // The battleship is excluded by kind rather than by size. Gating it on
  // diameter would make it edible to a craft at the size cap, and it is meant
  // to be the one thing in the sky that is never food.
  return kind !== 'anti-air' && kind !== 'boss' && diameter <= maxDiameter
}

export type BeamObject = {
  id: string
  kind: BeamObjectKind
  mass: number
  color: string
  position: Vec3
  velocity: Vec3
  rotation: Vec3
  angularVelocity: Vec3
  /** World-space size, for objects that are not a fixed model - a building
   *  keeps the footprint it had when it was torn out of the ground. */
  scale?: Vec3
  /** Facade variant and storey count, so a building being carried off still
   *  looks like the building it was. */
  facade?: number
  floors?: number
  active: boolean
  /**
   * Seconds of grip left after leaving the cone.
   *
   * A beam that dropped whatever fell outside its cone on the very next frame
   * was a geometric test, not a tractor beam - and once beam strength was tied
   * to craft size it stopped working entirely. At cruising speed a pedestrian
   * is inside the opening saucer's cone for about a third of a second, while
   * the haul takes a couple: nothing could ever be lifted while flying, only
   * while hovering, which is not the game. Catching something now means
   * holding it, and you drag it up as you go.
   */
  hold?: number
  inBeam: boolean
  tether: number
  playerTouched: boolean
  destroying: boolean
  destroyTimer: number
  explosionPending: boolean
  absorbing: boolean
  absorbTimer: number
  /** Broad physical width used by the UFO-size absorption gate. */
  diameter?: number
  /** Optional fixed base score; final points still scale with size. */
  scoreValue?: number
  /** Building-shaped or otherwise intentionally immune to beam physics. */
  beamImmune?: boolean
  /** False for AI actors that should resume their own motion after release. */
  freePhysics?: boolean
}

export type BeamField = {
  active: boolean
  boosting: boolean
  position: Vec3
  velocity: Vec3
  radiusScale?: number
  /** Reach multiplier. Comes from upgrades only - a bigger craft gets a wider
   *  beam because its body is wider, not a longer one. See beamProfile. */
  reachScale?: number
  /**
   * Grip multiplier on the pull. Scales how hard the beam hauls what it has
   * hold of, which is the counterweight to object mass: mass decides how long
   * something hangs there, this decides how much of that time can be bought
   * back.
   */
  gripScale?: number
  /** Integer tractor strength. Compared directly with object mass. */
  gripStrength?: number
  /**
   * Building boxes to land on.
   *
   * Without them a dropped object falls straight through whatever is under it
   * and lies down in the street - drop a car on a roof and it turns up on the
   * pavement. Only the top face is resolved, because a load landing on a roof
   * is the whole of what is visible; a full box sweep would be a lot of work
   * for the side of a wall nobody drops anything against.
   */
  colliders?: readonly Aabb[]
}

/** Height of the surface directly under a point - a roof if there is one. */
export function surfaceHeightAt(x: number, z: number, colliders?: readonly Aabb[]) {
  let height = GROUND_HEIGHT
  if (!colliders) return height
  for (const box of colliders) {
    if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue
    if (box.maxY > height) height = box.maxY
  }
  return height
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

/**
 * `maxDrop` is how far the beam reaches, and it scales with the craft the same
 * way radius and grip do.
 *
 * It used to be a constant, which meant a shrunken craft with a feeble beam
 * reached exactly as far as a huge one - and from any real altitude the beam
 * punched all the way to the street regardless of whether it could actually
 * lift anything down there. Size drives every other property of the beam; reach
 * was the one that ignored it.
 *
 * This is only about where the beam STOPS. The falloff within reach is
 * untouched: the far end still grips weakly, which is what produces "it's
 * caught but it barely moves".
 */
export function beamProfile(boosting: boolean, radiusScale = 1, reachScale = 1): BeamProfile {
  const scale = Math.max(0.1, radiusScale)
  const reach = Math.max(0.1, reachScale)
  // Widened for the growth loop: the beam is the only verb, so a pass over a
  // street has to actually sweep it rather than thread a needle.
  const profile = boosting
    ? { maxDrop: 47, baseRadius: 8.2, coneSpread: 0.34, spring: 25.5, response: 58 }
    : { maxDrop: 30, baseRadius: 5.8, coneSpread: 0.27, spring: 15.6, response: 32 }
  return {
    ...profile,
    maxDrop: profile.maxDrop * reach,
    baseRadius: profile.baseRadius * scale,
    coneSpread: profile.coneSpread * scale,
  }
}

export function beamVisualLength(droneHeight: number, maxDrop: number, groundHeight = 0.15) {
  return Math.max(0, Math.min(maxDrop, droneHeight - groundHeight))
}

export function beamObjectDiameter(object: Pick<BeamObject, 'kind' | 'diameter'>) {
  return object.diameter ?? DEFAULT_DIAMETER[object.kind]
}

export function absorptionScore(object: Pick<BeamObject, 'kind' | 'diameter' | 'mass' | 'scoreValue'>, scoreMultiplier = 1) {
  const diameter = beamObjectDiameter(object)
  // The mass coefficient came down when masses went up. That change was a unit
  // change - how long a thing rides the beam - and a unit change must not
  // quietly reprice everything in the game.
  const base = object.scoreValue ?? 8 + diameter * diameter * 7 + object.mass * 1.7
  return Math.max(1, Math.round(base * Math.max(0.1, scoreMultiplier)))
}

export function beginNearbyBeamObjectAbsorption(
  objects: BeamObject[],
  ufoPosition: Vec3,
  maxDiameter: number,
  reach: number,
) {
  for (const object of objects) {
    if (!object.active || object.absorbing || !object.inBeam || object.beamImmune) continue
    const diameter = beamObjectDiameter(object)
    if (!isAbsorbable(object.kind, diameter, maxDiameter)) continue
    const distance = Math.hypot(
      object.position.x - ufoPosition.x,
      object.position.y - ufoPosition.y,
      object.position.z - ufoPosition.z,
    )
    if (distance > reach) continue
    object.absorbing = true
    object.absorbTimer = BEAM_ABSORB_TIME
    object.inBeam = false
    object.tether = 0
    object.hold = 0
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
  const profile = beamProfile(field.boosting, field.radiusScale, field.reachScale)
  const drop = field.position.y - object.position.y
  if (drop < -0.5 || drop > profile.maxDrop) return false
  const radius = profile.baseRadius + Math.max(0, drop) * profile.coneSpread
  return Math.hypot(object.position.x - field.position.x, object.position.z - field.position.z) <= radius
}

export function beamGrip(drop: number, maxDrop: number, minGrip = BEAM_MIN_GRIP, exponent = BEAM_GRIP_EXPONENT) {
  const dropRatio = Math.max(0, Math.min(1, drop / Math.max(0.001, maxDrop)))
  return minGrip + (1 - minGrip) * Math.pow(1 - dropRatio, Math.max(2, exponent))
}

export type BeamLiftBand = 'fast' | 'strained' | 'marginal' | 'blocked'

/** The visible, teachable weight-vs-strength rule. */
export function beamLiftBand(weight: number, strength: number): BeamLiftBand {
  const delta = weight - strength
  if (delta <= -2) return 'fast'
  if (delta <= 0) return 'strained'
  if (delta <= 1) return 'marginal'
  return 'blocked'
}

export function beamLiftScale(weight: number, strength: number) {
  const band = beamLiftBand(weight, strength)
  return band === 'fast' ? 1.55 : band === 'strained' ? 0.58 : band === 'marginal' ? 0.12 : 0
}

export function beginCarDestruction(object: BeamObject, direction: Vec3, inheritedVelocity: Vec3) {
  if (!object.active || object.kind !== 'car' || object.destroying) return false
  object.destroying = true
  object.destroyTimer = 0.52
  object.explosionPending = true
  object.inBeam = false
  object.tether = 0
  object.hold = 0
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

export function stepBeamObjects(objects: BeamObject[], field: BeamField, dt: number, stepAbsorption = true) {
  const d = Math.min(Math.max(0, dt), 0.05)
  const profile = beamProfile(field.boosting, field.radiusScale, field.reachScale)

  for (const object of objects) {
    if (!object.active) continue
    if (object.absorbing) {
      if (!stepAbsorption) continue
      object.absorbTimer = Math.max(0, object.absorbTimer - d)
      if (object.absorbTimer <= 0) {
        object.active = false
        object.absorbing = false
        object.inBeam = false
        object.tether = 0
        object.hold = 0
      }
      continue
    }
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
        object.hold = 0
      }
      continue
    }
    if (object.beamImmune) {
      object.inBeam = false
      object.tether = 0
      object.hold = 0
      continue
    }
    const inside = isInsideBeam(object, field)
    // Grip only lapses once the beam is off. While it is on, a load stays
    // caught even after the craft has flown past it.
    object.hold = inside && field.active
      ? BEAM_HOLD_TIME
      : field.active
        ? (object.hold ?? 0)
        : Math.max(0, (object.hold ?? 0) - d)
    const captured = field.active && (inside || (object.hold ?? 0) > 0)
    object.inBeam = captured
    const liftScale = beamLiftScale(object.mass, field.gripStrength ?? 12)
    const lifting = captured && liftScale > 0

    if (lifting) {
      object.playerTouched = true
      const mass = Math.max(0.08, object.mass)
      const drop = Math.max(0, field.position.y - object.position.y)
      const grip = beamGrip(drop, profile.maxDrop) * liftScale * Math.max(0.1, field.gripScale ?? 1)
      const spring = profile.spring * grip / mass
      const hash = hashId(object.id)
      const slot = hash % 11
      const angle = (hash % 360) * Math.PI / 180
      // The slots a load is parked in scale with the craft. They used to be
      // fixed distances, which is fine for a saucer five metres across and
      // absurd for one two metres across - the load hung further below the
      // craft than the craft could reach to swallow it, so a small craft
      // could catch a person, drag them along indefinitely, and never eat
      // them.
      const rig = Math.max(0.45, field.radiusScale ?? 1)
      const orbit = (0.6 + (slot % 4) * 0.28) * rig
      const layer = slot % 3
      const anchor = {
        x: field.position.x + Math.cos(angle) * orbit,
        y: Math.max(GROUND_HEIGHT + 0.8, field.position.y - (1.8 + layer * 0.48) * rig),
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
      if (object.freePhysics === false && object.tether <= 0.02) continue
      object.velocity.y -= 9.8 * d
    }

    object.position.x += object.velocity.x * d
    object.position.y += object.velocity.y * d
    object.position.z += object.velocity.z * d
    object.rotation.x += object.angularVelocity.x * d
    object.rotation.y += object.angularVelocity.y * d
    object.rotation.z += object.angularVelocity.z * d

    const floor = lifting ? GROUND_HEIGHT : surfaceHeightAt(object.position.x, object.position.z, field.colliders)
    if (object.position.y < floor) {
      object.position.y = floor
      object.velocity.y = Math.abs(object.velocity.y) * 0.18
      const groundFriction = Math.pow(0.72, d * 60)
      object.velocity.x *= groundFriction
      object.velocity.z *= groundFriction
      object.angularVelocity.x *= groundFriction
      object.angularVelocity.y *= Math.pow(0.86, d * 60)
      object.angularVelocity.z *= groundFriction
      if (!lifting) {
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
    if (!left.active || left.destroying || left.absorbing || !left.playerTouched) continue
    for (let rightIndex = leftIndex + 1; rightIndex < objects.length; rightIndex += 1) {
      const right = objects[rightIndex]!
      if (!right.active || right.destroying || right.absorbing || !right.playerTouched) continue
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

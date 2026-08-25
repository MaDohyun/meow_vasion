import type { BuildingRuin } from './buildings'
import type { Aabb, Vec3 } from './drone'

export type BeamObjectKind =
  | 'car' | 'truck' | 'pedestrian' | 'cat' | 'explosive' | 'building'
  | 'rooftop-structure' | 'tree' | 'utility-pole' | 'power-pylon' | 'communications'
  | 'trash-bin' | 'park-bench' | 'bus-stop' | 'subway'
  | 'shore-rock' | 'shore-reed' | 'gas-station' | 'ruin'
  | 'drone' | 'helicopter'
  | 'fighter' | 'boss'

export type BeamWorldProp = {
  id: string
  kind: 'rooftop-structure' | 'tree' | 'utility-pole' | 'power-pylon' | 'communications' | 'trash-bin' | 'park-bench' | 'bus-stop' | 'subway' | 'shore-rock' | 'shore-reed' | 'gas-station'
  position: Vec3
  rotation: number
  scale: Vec3
  variant: number
  /** The building a rooftop structure belongs to, while remaining separate. */
  buildingId?: string
  height?: number
  crown?: number
}

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
 *
 * "What it catches" is the load-bearing half. Only what the weight band lets
 * the beam actually lift is caught at all; the cone playing over something too
 * heavy grips nothing and holds nothing (see stepBeamObjects).
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
  // The lakeside pair. Both are the smallest things in the city that are not
  // alive, and both have to fit through the opening saucer's 2.48m hull -
  // a pond is the one place a brand-new craft can feed on scenery.
  'shore-reed': 1.4,
  'shore-rock': 1.6,
  drone: 1.6,
  car: 2.9,
  truck: 4.2,
  fighter: 4.4,
  helicopter: 4.6,
  explosive: 5.1,
  'rooftop-structure': 6.2,
  tree: 4.4,
  'utility-pole': 2.8,
  'trash-bin': 1.7,
  'park-bench': 3.4,
  'bus-stop': 7.2,
  'power-pylon': 7.2,
  subway: 8.6,
  communications: 12,
  // A whole forecourt, canopy and pumps included - the widest thing in the
  // city that is not a building. Only a fallback; the live prop carries the
  // same figure from WORLD_PROP_DIAMETERS.
  'gas-station': 18,
  // Rubble keeps ninety percent of the block's footprint. Only a fallback -
  // a live ruin measures its own, see ruinBulk.
  ruin: 18,
  // The battleship's beam width. Only a fallback - the live ship carries its
  // own measured hull in `ENEMY_DIAMETER`.
  boss: 16,
}

/** Everything is eligible once it is no wider than the hull itself -
 *  `maxDiameter` is the current UFO diameter - with the drone mine the single
 *  exception below.
 *
 *  The sky is on the same terms as the street now. The helicopter, the fighter
 *  and the dreadnought used to be excluded here or flagged `beamImmune`, which
 *  made "can I eat it" a question about what something *is* rather than about
 *  how big and how heavy it is. They are ordinary beam objects with ordinary
 *  weights (6, 10 and 30, the heaviest in the game); a craft that has grown
 *  enough to move thirty units of hanging ship has earned it.
 *
 *  This is the swallow gate, not the pull gate. What the beam can shift is the
 *  weight ladder's question (see beamLiftScale); this one asks the separate
 *  question of what will go through the hull. They are independent inputs, and
 *  a caller must pass both - `maxDiameter` defaults to infinity, which is
 *  exactly how the hull rule came to be documented here and never applied. */
export function isAbsorbable(kind: BeamObjectKind, diameter = DEFAULT_DIAMETER[kind], maxDiameter = Number.POSITIVE_INFINITY) {
  // The drone mine is the one exclusion: the beam can catch one, but a bomb is
  // never banked as a meal - drawn to the hull it strikes and detonates
  // through the same rules as flying into it, so the swallow path must never
  // quietly defuse it first.
  return kind !== 'drone' && diameter <= maxDiameter
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
  /** Procedural city prop metadata used by the static and lifted render pools. */
  worldProp?: BeamWorldProp
  /** The rubble this object was, for the lifted ruin pool. Ruins are runtime
   *  state rather than world generation, so they cannot be world props - a
   *  ruin only exists because the player brought a building down. */
  ruin?: BuildingRuin
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
  /**
   * The cone the haul spring is tuned against, which is no longer the cone the
   * beam actually has. See the vertical clamp in stepBeamObjects: the drive is
   * scaled by this, so lengthening `maxDrop` moves where the beam stops
   * without also making a deep catch fly up faster.
   */
  haulDrop: number
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
 *
 * The base reach was 30m, and the opening saucer's ceiling is 30.9m. Those two
 * numbers were never chosen against each other and the coincidence was doing
 * real damage: a beginner who climbed to the top of their own altitude range -
 * which is what you do to clear a mid-rise roof - was flying at exactly the
 * height where the beam stopped touching the street. The city was visible and
 * out of reach at the same time, on the one verb the game has. 40m (60
 * boosted) covers the whole opening altitude range with room over a roof.
 *
 * Reach is all that moved. What the beam does inside that reach - the falloff,
 * and the flat BEAM_HAUL_FLOOR under it - is untouched, so a catch from the
 * new far end is exactly as slow as the old far end was: the change is that
 * there is a catch at all. Descending is still how a beginner eats quickly.
 */
export function beamProfile(boosting: boolean, radiusScale = 1, reachScale = 1): BeamProfile {
  const scale = Math.max(0.1, radiusScale)
  const reach = Math.max(0.1, reachScale)
  // Widened for the growth loop: the beam is the only verb, so a pass over a
  // street has to actually sweep it rather than thread a needle.
  const profile = boosting
    ? { maxDrop: 60, haulDrop: 47, baseRadius: 8.2, coneSpread: 0.34, spring: 25.5, response: 58 }
    : { maxDrop: 40, haulDrop: 30, baseRadius: 5.8, coneSpread: 0.27, spring: 15.6, response: 32 }
  return {
    ...profile,
    maxDrop: profile.maxDrop * reach,
    haulDrop: Math.min(profile.haulDrop * reach, BEAM_HAUL_TUNED_DROP),
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

/**
 * Swallows one thing the beam has hold of, if anything is close enough.
 *
 * `gripStrength` is the same integer the lifting ladder uses, and every object
 * is measured against it before it can be eaten. Absorption used to ask only
 * whether a thing was in the cone and within reach, which meant a beam far too
 * weak to shift a bus shelter still made it vanish the moment the craft
 * skimmed past it - scenery blinking out of a standing city on contact, with
 * none of the lift the weight ladder promises. What cannot be lifted is simply
 * not food; a graze plays over it and leaves it where it stands.
 *
 * The gate is not for city dressing alone. It was, and that exemption was the
 * larger half of the same bug: a car weighs three and the opening craft pulls
 * with one, so a beam that could not raise it a hand's width off the tarmac
 * still swallowed it whole on contact. Trucks and tankers sat in the same
 * hole. The weight ladder was being charged for a park bench and
 * waived for everything the player actually flies over, which is the wrong way
 * round - a bench is scenery, a car is the meal the ladder is supposed to be
 * about. Loose or rooted, above the band is above the band.
 *
 * It also puts the simulation back in step with what the player is shown: the
 * beam target ring is already withheld from anything above the current band,
 * so an unliftable load carried no marker at all and then went off in a flash
 * of sparks as the craft passed over it.
 *
 * Nothing is lost by refusing it, only deferred. Strength climbs with the hull
 * and never falls, so a car the opening saucer cannot budge is a car it eats a
 * few dozen pedestrians later - which is the growth loop stating its own
 * terms rather than the beam quietly ignoring them.
 */
export function beginNearbyBeamObjectAbsorption(
  objects: BeamObject[],
  ufoPosition: Vec3,
  maxDiameter: number,
  reach: number,
  gripStrength = Number.POSITIVE_INFINITY,
) {
  for (const object of objects) {
    if (!object.active || object.absorbing || !object.inBeam || object.beamImmune) continue
    const diameter = beamObjectDiameter(object)
    if (!isAbsorbable(object.kind, diameter, maxDiameter)) continue
    if (beamLiftScale(object.mass, gripStrength) <= 0) continue
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

/**
 * The slowest the beam may reel a load in, in metres per second.
 *
 * There has to be a floor, because the opening saucer is one strength rung
 * below a person: `beamLiftScale` returns 0.12 for a pedestrian, which
 * collapses the spring to almost nothing, and without a floor a beginner's
 * first catch would hang in the air rather than come up.
 *
 * Deliberately flat, and it stays flat. A floor that grew with the drop would
 * make a body caught 30m down arrive faster than one caught 5m down, which
 * inverts the rule the whole beam is built on - reach is cheap, grip is what
 * costs, and flying low is how you buy it. Longer reach therefore means a
 * longer haul, never a quicker one.
 */
export const BEAM_HAUL_FLOOR = 0.9

/**
 * The longest cone the haul spring was ever tuned against - the boost beam's
 * reach before the cones were lengthened. Every profile's `haulDrop` stops
 * here, so a grown craft's drive is the same one it always had.
 */
export const BEAM_HAUL_TUNED_DROP = 47

export function beamGrip(drop: number, maxDrop: number, minGrip = BEAM_MIN_GRIP, exponent = BEAM_GRIP_EXPONENT) {
  const dropRatio = Math.max(0, Math.min(1, drop / Math.max(0.001, maxDrop)))
  return minGrip + (1 - minGrip) * Math.pow(1 - dropRatio, Math.max(2, exponent))
}

export type BeamLiftBand = 'fast' | 'strained' | 'marginal' | 'blocked'

/** The visible, teachable weight-vs-strength rule. */
export function beamLiftBand(weight: number, strength: number): BeamLiftBand {
  // Excess grip above two points is intentionally not converted into more
  // speed. It only makes a heavier integer rung available to the player.
  const excess = Math.min(2, Math.max(0, strength - weight))
  if (excess >= 2) return 'fast'
  const delta = weight - strength
  if (delta <= 0) return 'strained'
  if (delta <= 1) return 'marginal'
  return 'blocked'
}

export function beamLiftScale(weight: number, strength: number) {
  const band = beamLiftBand(weight, strength)
  return band === 'fast' ? 1.55 : band === 'strained' ? 0.58 : band === 'marginal' ? 0.12 : 0
}

/**
 * A laser hit sends a bin flying rather than blowing it up.
 *
 * Same launch machinery as a car, minus the explosion: a bin is litter, not
 * ordnance, so it tumbles off spraying its contents (the render layer's
 * litter flecks follow any launched bin) and simply stops existing where it
 * lands. One hit at any laser level - there is nothing durable about a bin.
 */
export function beginTrashBinLaunch(object: BeamObject, direction: Vec3, inheritedVelocity: Vec3) {
  if (!object.active || object.kind !== 'trash-bin' || object.destroying) return false
  object.destroying = true
  object.destroyTimer = 0.9
  object.explosionPending = false
  object.inBeam = false
  object.tether = 0
  object.hold = 0
  object.playerTouched = true
  object.freePhysics = true
  object.velocity.x = direction.x * 24 + inheritedVelocity.x * 0.22
  object.velocity.y = direction.y * 24 + inheritedVelocity.y * 0.08 + 12
  object.velocity.z = direction.z * 24 + inheritedVelocity.z * 0.22
  const spin = object.id.length % 2 === 0 ? 1 : -1
  object.angularVelocity.x = spin * 12
  object.angularVelocity.y = spin * 16
  object.angularVelocity.z = -spin * 10
  return true
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
    const liftScale = beamLiftScale(object.mass, field.gripStrength ?? 12)
    // Only a load the beam can actually lift is gripped, and only a gripped
    // load keeps its hold after leaving the cone.
    //
    // The retention rule below - grip does not lapse while the beam is on - is
    // about carrying what you caught in passing, and it was being handed to
    // things the beam never caught at all. A tree, a pylon, a bus shelter, a
    // fighter: anything above the weight band takes `liftScale` 0, is never
    // moved a millimetre, and used to be stamped held for the rest of the
    // flight anyway, from any distance, simply for having been grazed once.
    //
    // That is the bug behind objects sailing in from off-screen as the craft
    // grows. Strength climbs with the hull and never falls, so the moment
    // growth lifted the band, every prop the cone had swept over the whole run
    // - a city's worth of them, out to the far edge of the simulation - became
    // liftable at once and was hauled in from wherever it stood, the spring
    // pulling harder the further away it was. It also left half the sky
    // switched off: enemies skip their AI, their contact damage and the threat
    // count while `inBeam` is set (see core/enemies), so a beginner's beam was
    // a permanent freeze ray on every helicopter and fighter it brushed past.
    //
    // `inBeam` still goes true for an unliftable object while the cone is
    // physically on it - that is what the player sees, and the ballast and
    // static-prop rules already ask `tether` rather than this. What it no
    // longer does is outlive the cone. To catch what it once could not lift,
    // the grown craft has to fly over it again.
    const gripped = liftScale > 0
    object.hold = gripped && field.active
      ? (inside ? BEAM_HOLD_TIME : (object.hold ?? 0))
      : Math.max(0, (object.hold ?? 0) - d)
    const captured = field.active && (inside || (object.hold ?? 0) > 0)
    object.inBeam = captured
    const lifting = captured && liftScale > 0

    if (lifting) {
      object.playerTouched = true
      // City dressing starts frozen on its spawn transform (see
      // makeWorldPropBeamObject); once the beam has actually moved it, it
      // falls, tumbles and lands like anything else.
      if (object.worldProp) object.freePhysics = true
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
      // Scaled by the tuned cone rather than the real one - longer reach must
      // mean a longer haul, not a faster catapult. This used to read the real
      // maxDrop and clamp it at 47, which was the same number while 47 was the
      // boost beam's own reach; once the base cones were lengthened for the
      // opening craft, that clamp quietly handed the short beam a third more
      // drive and a deep catch started outrunning a shallow one.
      const verticalLimit = profile.haulDrop * 0.34
      const verticalOffset = Math.max(-verticalLimit, Math.min(verticalLimit, anchor.y - object.position.y))
      const desired = {
        x: field.velocity.x + (anchor.x - object.position.x) * spring,
        y: field.velocity.y + verticalOffset * spring * grip,
        z: field.velocity.z + (anchor.z - object.position.z) * spring,
      }
      if (anchor.y > object.position.y) desired.y = Math.max(desired.y, BEAM_HAUL_FLOOR)
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

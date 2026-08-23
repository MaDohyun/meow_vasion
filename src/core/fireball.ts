import type { Vec3 } from './drone'

/**
 * A billowing blast, as data.
 *
 * The existing laser burst is a flat ring and a spark: right for a rifle round
 * hitting a wall, far too small for something that just killed the player. A
 * mine going off has to read as a volume erupting outward, so it is built out
 * of puffs - lobes that are born at the centre, rush out along their own
 * direction, swell, and go from white-hot through flame to smoke.
 *
 * The look comes from the stagger. Every puff starts at the middle and none of
 * them start together: the first few are already flame while the outer ones are
 * still erupting white-hot through the gaps, which is what makes it look like
 * it is being driven from inside rather than simply scaled up.
 *
 * Pure data and scalars - no Three.js. The render layer owns the geometry and
 * the colour ramp, so the timing can be tested on its own.
 */

/** Lobes per blast. Enough to close the silhouette, few enough to instance. */
export const FIREBALL_PUFFS = 16
/** Blasts that can overlap before the oldest is recycled. */
export const FIREBALL_MAX = 5
export const FIREBALL_DURATION = 1.15

export type FireballPuff = {
  /** Unit direction the lobe erupts along. */
  direction: Vec3
  /** How far out it travels, as a share of the blast radius. */
  distance: number
  /** Extra lift, as a share of the blast radius: smoke rises. */
  rise: number
  /** Lobe size at full swell, as a share of the blast radius. */
  radius: number
  /** Share of the blast's own life this lobe waits before erupting. */
  delay: number
  /** Per-lobe shading and rotation offset. */
  seed: number
}

export type Fireball = {
  id: string
  active: boolean
  position: Vec3
  /** Matches the blast radius of whatever went off, so the fire covers what
   *  it killed rather than being sized by eye. */
  radius: number
  age: number
  duration: number
  puffs: FireballPuff[]
}

function hashed(value: number) {
  let x = value >>> 0 || 1
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  return (x >>> 0) / 0xffffffff
}

function makePuff(slot: number): FireballPuff {
  return {
    direction: { x: 0, y: 1, z: 0 },
    distance: 0,
    rise: 0,
    radius: 0.3,
    delay: slot / FIREBALL_PUFFS,
    seed: slot,
  }
}

export function createFireballPool(): Fireball[] {
  return Array.from({ length: FIREBALL_MAX }, (_, slot) => ({
    id: `fireball:${slot}`,
    active: false,
    position: { x: 0, y: 0, z: 0 },
    radius: 1,
    age: 0,
    duration: FIREBALL_DURATION,
    puffs: Array.from({ length: FIREBALL_PUFFS }, (_, index) => makePuff(index)),
  }))
}

/**
 * Lay out one blast.
 *
 * The lobes are spread on a Fibonacci sphere rather than at random bearings:
 * a handful of random directions leaves holes you can see straight through,
 * and the blast has to be opaque enough to hide what it is standing in front
 * of. The randomness goes into the radii, the timing and the travel instead,
 * where gaps do not show.
 */
export function triggerFireball(pool: Fireball[], position: Vec3, radius: number, seed = 0) {
  const fireball = pool.find((item) => !item.active)
    ?? pool.reduce((oldest, item) => (item.age > oldest.age ? item : oldest))
  fireball.active = true
  fireball.age = 0
  fireball.duration = FIREBALL_DURATION
  fireball.radius = Math.max(0.5, radius)
  fireball.position.x = position.x
  fireball.position.y = position.y
  fireball.position.z = position.z
  const salt = (seed * 0x9e3779b1) >>> 0
  for (let index = 0; index < fireball.puffs.length; index += 1) {
    const puff = fireball.puffs[index]!
    const rollA = hashed(salt + index * 0x27d4eb2f + 1)
    const rollB = hashed(salt + index * 0x165667b1 + 2)
    const rollC = hashed(salt + index * 0x2545f491 + 3)
    // Fibonacci sphere, nudged so two blasts in the same spot are not twins.
    const y = 1 - ((index + 0.5) / FIREBALL_PUFFS) * 2
    const ring = Math.sqrt(Math.max(0, 1 - y * y))
    const angle = index * 2.399963 + rollA * 0.9
    puff.direction.x = Math.cos(angle) * ring
    puff.direction.y = y
    puff.direction.z = Math.sin(angle) * ring
    // The first few barely leave the middle; that is the core you see through
    // the gaps in the ones that do.
    puff.distance = index < 3 ? 0.1 * rollB : 0.24 + rollB * 0.38
    puff.rise = 0.1 + rollC * 0.24
    puff.radius = 0.26 + rollA * 0.17
    puff.delay = index < 3 ? 0 : (index / FIREBALL_PUFFS) * 0.5 + rollC * 0.12
    puff.seed = rollA * 100 + index
  }
  return fireball
}

export function stepFireballs(pool: Fireball[], dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  for (const fireball of pool) {
    if (!fireball.active) continue
    fireball.age += d
    if (fireball.age >= fireball.duration) fireball.active = false
  }
  return pool
}

/**
 * How far through its own life a lobe is.
 *
 * Below zero it has not erupted yet and must not be drawn; above one it is
 * gone. Every lobe finishes with the blast, so a late one lives a shorter,
 * faster life than an early one - the tail of the explosion is the smoke of
 * the first lobes, not a straggler still turning orange.
 */
export function fireballPuffProgress(fireball: Fireball, puff: FireballPuff) {
  const start = puff.delay * fireball.duration
  const span = Math.max(0.001, fireball.duration - start)
  return (fireball.age - start) / span
}

/** Where a lobe's centre has reached, in world space. */
export function fireballPuffCentre(fireball: Fireball, puff: FireballPuff, progress: number, out: Vec3) {
  const t = Math.min(1, Math.max(0, progress))
  // Thrown out hard and then coasting: the blast is over before the smoke is.
  const travel = 1 - Math.pow(1 - t, 2.6)
  out.x = fireball.position.x + puff.direction.x * puff.distance * fireball.radius * travel
  out.y = fireball.position.y + puff.direction.y * puff.distance * fireball.radius * travel
    + puff.rise * fireball.radius * t * t
  out.z = fireball.position.z + puff.direction.z * puff.distance * fireball.radius * travel
  return out
}

/** Lobe radius in world units: swells fast, then keeps creeping as it cools. */
export function fireballPuffRadius(fireball: Fireball, puff: FireballPuff, progress: number) {
  const t = Math.min(1, Math.max(0, progress))
  const swell = 1 - Math.pow(1 - t, 3)
  return puff.radius * fireball.radius * (0.22 + swell * 0.82 + t * 0.24)
}

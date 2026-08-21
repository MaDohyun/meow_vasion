/**
 * Craft size - the run's only resource.
 *
 * Size is health, weapon power, score multiplier and mobility all at once.
 * Absorbing grows it, taking hits shrinks it, and dropping below the minimum
 * ends the run. There is no health bar because the craft itself is the readout:
 * the player can see exactly how they are doing by looking at their own body.
 *
 * Size deliberately does NOT affect speed. Growth is the thing the player is
 * good at, and taxing it directly punishes them for succeeding, on a curve they
 * cannot influence.
 *
 * Two costs keep growth honest instead, and both are answerable with skill:
 *
 * 1. A bigger craft is a bigger target - the hit radius scales, so the same fire
 *    is harder to survive once fat. Dodging is the answer.
 * 2. A bigger beam is easier to foul. The cone widens with size, which sweeps up
 *    people faster but also snags cars and other dead weight, and dead weight is
 *    what actually slows the craft down (see beam ballast). Beam discipline is
 *    the answer.
 *
 * So the speed penalty exists, but it is charged for sloppy beam work rather
 * than for being large.
 */

export const SIZE_START = 1
/** Below this the run ends. Start is deliberately close to it, so the first
 *  minute already carries tension. */
export const SIZE_MIN = 0.62
export const SIZE_MAX = 3.1
/** Approximate visible width of the starting saucer, including its rim lamps. */
export const UFO_BASE_DIAMETER = 5.4

/**
 * Growth per absorbed body. Cats are worth more than people, which is what makes
 * chasing the fast, evasive target worthwhile.
 *
 * Living targets keep their authored gains. Larger non-building objects use a
 * diameter-scaled gain in GameContext once the craft is large enough to eat
 * them.
 */
export const SIZE_GAIN = {
  pedestrian: 0.072,
  cat: 0.116,
} as const

export type SizeGainKind = keyof typeof SIZE_GAIN

/** Shrink per hit. Ordered so that the threats the player can see coming cost
 *  the most - being surprised should never be the expensive mistake. */
export const SIZE_LOSS = {
  rifle: 0.05,
  shell: 0.1,
  missile: 0.17,
  rocket: 0.08,
  'boss-beam': 0.13,
  contact: 0.09,
  building: 0.04,
  explosive: 0.24,
} as const

export type SizeLossKind = keyof typeof SIZE_LOSS

export type SizeProfile = {
  size: number
  /** 0 at the death threshold, 1 at maximum. Drives HUD and audio. */
  ratio: number
  /** Beam cone radius multiplier. */
  beamScale: number
  /** Grip strength on held objects. */
  beamPower: number
  /** How close a body must come before it is swallowed. */
  absorbDistance: number
  /** Body radius for incoming fire and contact damage. */
  hitRadius: number
  /** Chase camera distance for a craft at rest. Speed and altitude add to it
   *  in the render layer; those have nothing to do with size. */
  cameraDistance: number
  /** Points multiplier; being big is worth more than being alive. */
  scoreMultiplier: number
}

/** Chase distance at the starting size. Held here rather than in the render
 *  layer so the pull-back rule below is one number applied to one number. */
export const CAMERA_REST_DISTANCE = 12

/**
 * Doubling the craft pulls the camera back by half again, not by double.
 *
 * The camera used to retreat faster than the craft grew - a twofold craft got
 * a 2.25-fold pull-back - so growing changed the picture without ever making
 * the player feel bigger, which is the one thing the whole run is about. Under
 * this exponent the saucer takes up more of the frame the larger it gets,
 * which is the point, while still leaving room to see what it is reaching for.
 */
export const CAMERA_GROWTH_PULL_BACK = 1.5
export const CAMERA_SIZE_EXPONENT = Math.log2(CAMERA_GROWTH_PULL_BACK)

export function clampSize(size: number) {
  return Math.min(SIZE_MAX, Math.max(0, size))
}

export function isSizeFatal(size: number) {
  return size < SIZE_MIN
}

export function sizeProfile(size: number): SizeProfile {
  const clamped = clampSize(size)
  const ratio = Math.min(1, Math.max(0, (clamped - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)))
  // Sub-linear, so the beam still grows at the top end without the late game
  // turning into a vacuum that clears a whole block in one pass.
  const beamScale = Math.pow(clamped, 0.78)
  return {
    size: clamped,
    ratio,
    beamScale,
    beamPower: 0.45 + clamped * 0.62,
    absorbDistance: 2.1 + clamped * 1.5,
    hitRadius: 1.05 * clamped,
    cameraDistance: CAMERA_REST_DISTANCE * Math.pow(clamped, CAMERA_SIZE_EXPONENT),
    scoreMultiplier: clamped,
  }
}

export function growSize(size: number, kind: SizeGainKind) {
  return clampSize(size + SIZE_GAIN[kind])
}

export function growSizeBy(size: number, amount: number) {
  return clampSize(size + Math.max(0, amount))
}

export function ufoDiameter(size: number) {
  return UFO_BASE_DIAMETER * clampSize(size)
}

export function shrinkSize(size: number, kind: SizeLossKind) {
  return clampSize(size - SIZE_LOSS[kind])
}

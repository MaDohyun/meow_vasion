/**
 * Craft size - the run's only resource.
 *
 * Size is health, weapon power, score multiplier and mobility all at once.
 * Absorbing grows it, taking hits shrinks it, and dropping below the minimum
 * ends the run. There is no health bar because the craft itself is the readout:
 * the player can see exactly how they are doing by looking at their own body.
 *
 * Two relationships keep growth from being free:
 *
 * 1. A bigger craft is slower and turns worse. Growth buys reach and power and
 *    pays for it in agility, so "get as big as possible" is a real decision
 *    rather than the obviously correct one.
 * 2. A bigger craft is a bigger target. The hit radius scales with size, so the
 *    same bullet stream is harder to survive once fat.
 *
 * The inverse matters just as much. A shrinking craft gets FASTER, which is the
 * only thing standing between a bad hit and an unrecoverable death spiral:
 * small means a weak beam, but it also means you can dodge long enough to feed
 * yourself back up.
 */

export const SIZE_START = 1
/** Below this the run ends. Start is deliberately close to it, so the first
 *  minute already carries tension. */
export const SIZE_MIN = 0.62
export const SIZE_MAX = 3.1

/** Growth per absorbed body. Cats are worth more than people, which is what
 *  makes chasing the fast, evasive target worthwhile. */
export const SIZE_GAIN = {
  pedestrian: 0.036,
  cat: 0.058,
  car: 0.022,
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
  /** Effective load handed to the flight model: bigger is heavier. */
  drag: number
  /** Chase camera pull-back. */
  cameraDistance: number
  /** Points multiplier; being big is worth more than being alive. */
  scoreMultiplier: number
}

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
    // Positive above the starting size, negative below it, so shrinking hands
    // back agility instead of only taking things away.
    drag: (clamped - SIZE_START) * 3.4,
    cameraDistance: clamped * 2.6,
    scoreMultiplier: clamped,
  }
}

export function growSize(size: number, kind: SizeGainKind) {
  return clampSize(size + SIZE_GAIN[kind])
}

export function shrinkSize(size: number, kind: SizeLossKind) {
  return clampSize(size - SIZE_LOSS[kind])
}

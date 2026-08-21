/**
 * Craft size - growth, score, and how the game looks.
 *
 * Size used to be health as well: hits shrank it and a floor ended the run.
 * That is gone (see core/health). Size now **only ever goes up**, because
 * growing is the best thing in the game and a hit that rewinds it is punishing
 * progress rather than punishing a mistake.
 *
 * The run opens on a saucer barely wider than the people under it, and there
 * is room to grow for the whole five minutes. Nothing here can kill you.
 *
 * Growing is not free, though. Two costs, both answerable with skill:
 *
 * 1. A bigger craft is a bigger target. The hit radius scales, and since shots
 *    are led and fast enough to arrive, a grown craft holding a heading takes
 *    several times the fire a small one does. Weaving is the answer.
 * 2. A bigger beam is easier to foul. The cone widens with size, which sweeps
 *    up people faster but also snags cars and other dead weight, and dead
 *    weight is what slows the craft down. Beam discipline is the answer.
 *
 * Size also decides how high the craft can fly, which is less a limit than a
 * change of scenery: a small saucer is pinned among the buildings and threads
 * the streets, a grown one has the sky and would not fit between the towers
 * anyway.
 */

/**
 * The opening saucer: about two and a half metres across, which is roughly
 * three people wide. Small enough that one pedestrian is a real meal.
 */
export const SIZE_START = 0.46
/** A floor, not a fail state. Size cannot fall below it because size cannot
 *  fall at all; it exists so callers can clamp safely. */
export const SIZE_MIN = 0.3
/**
 * The ceiling, opened up by a factor of five.
 *
 * Raising the growth rate without raising this just means capping out in the
 * first ninety seconds and spending the rest of the run at a fixed size, which
 * is the opposite of the point. Five minutes of growing means five minutes of
 * room to grow.
 */
export const SIZE_MAX = 15
/** Visible width of the saucer at size 1. */
export const UFO_BASE_DIAMETER = 5.4

/**
 * Growth per absorbed body, as a **fraction of current size**.
 *
 * Proportional rather than flat, for two reasons. It is how the fantasy
 * actually works - one person is an enormous meal for a saucer two metres wide
 * and nothing at all for one that is eighty - and flat gains cannot span the
 * range: reaching the ceiling from the new starting size would take two
 * hundred pedestrians at the old rate, which no run will ever deliver.
 *
 * Cats are worth more than people, which is what makes chasing the fast,
 * evasive target worthwhile.
 */
export const SIZE_GAIN = {
  pedestrian: 0.035,
  cat: 0.058,
} as const

export type SizeGainKind = keyof typeof SIZE_GAIN

export type SizeProfile = {
  size: number
  /** 0 at the death threshold, 1 at maximum. Drives HUD and audio. */
  ratio: number
  /** Beam cone radius multiplier. */
  beamScale: number
  /**
   * Natural grip on whatever the beam has hold of, before any upgrade.
   *
   * This is what makes growing feel like growing. The opening saucer can
   * barely drag one person up the beam - it takes over a second and you watch
   * it happen - and a craft several times the size of a building can just
   * about manage a building. Upgrades multiply on top of this rather than
   * replacing it, so a player who never spends a card on pull still gets
   * stronger simply by being bigger.
   */
  beamPower: number
  /** How close a body must come before it is swallowed. */
  absorbDistance: number
  /** Body radius for incoming fire and contact damage. */
  hitRadius: number
  /** How high this craft may climb. See maxAltitude. */
  maxAltitude: number
  /** Fog-distance multiplier. See viewDistanceScale. */
  viewDistance: number
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
 * The natural-grip curve, and it is the whole progression ladder.
 *
 * The rule it is built to: **every doubling of size moves you one rung up the
 * list of things the beam can lift.** Cat, person, car, tanker, low-rise,
 * mid-rise, tower. What you are is what you can just about manage; the rung
 * below is easy; the rung above is out of reach until you grow or spend a card.
 *
 * The exponent was fitted by measuring, not derived. The arithmetic says 2 -
 * mass spans 1071 from a person to a tower and size spans 32.6, so grip should
 * span the first over the second - but the beam is a spring, and rise time is
 * not linear in grip over mass. Past a point the object simply snaps up, which
 * compresses the ladder badly: at 2, everything in the game was liftable by
 * size four and the top two thirds of the range had nothing new in it. 1.4 is
 * the value that actually spreads the rungs across the whole range, checked
 * against measured rise times rather than against the model.
 *
 * The floor is what a brand new saucer manages on its own. Deliberately
 * feeble - struggling to drag one person up the beam is the opening this run
 * is supposed to have - but not so feeble that it cannot feed at all. Grip also
 * falls off with how far below the craft the load is, and at first the two
 * together left the opening saucer unable to lift anybody from any altitude it
 * could actually fly at. The floor lifts the bottom of the ladder without
 * moving the top, where the exponent has already taken over.
 */
export const BEAM_POWER_FLOOR = 0.13
export const BEAM_POWER_EXPONENT = 1.4
export const BEAM_POWER_GAIN = 0.46

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
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, size))
}

export function sizeProfile(size: number): SizeProfile {
  const clamped = clampSize(size)
  const ratio = Math.min(1, Math.max(0, (clamped - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)))
  // Sub-linear, so the beam still grows at the top end without the late game
  // turning into a vacuum that clears a whole block in one pass - and with a
  // floor under it, because aperture and strength are different levers. The
  // opening craft is meant to *struggle* to lift a person, not to be unable to
  // catch one: scaling the cone straight off size gave the starting saucer a
  // four-metre beam that swept a street for a minute without touching anybody,
  // since people scatter sideways faster than a narrow cone can cover. Weakness
  // belongs in beamPower. Normalised so size 1 is unchanged at 1.
  const beamScale = 0.55 + Math.pow(clamped, 0.78) * 0.45
  return {
    size: clamped,
    ratio,
    beamScale,
    beamPower: BEAM_POWER_FLOOR + Math.pow(clamped, BEAM_POWER_EXPONENT) * BEAM_POWER_GAIN,
    absorbDistance: 2.1 + clamped * 1.5,
    hitRadius: 1.05 * clamped,
    maxAltitude: maxAltitude(clamped),
    viewDistance: viewDistanceScale(clamped),
    cameraDistance: CAMERA_REST_DISTANCE * Math.pow(clamped, CAMERA_SIZE_EXPONENT),
    scoreMultiplier: clamped,
  }
}

export function growSize(size: number, kind: SizeGainKind) {
  return clampSize(size * (1 + SIZE_GAIN[kind]))
}

/** `amount` is a fraction of current size, matching SIZE_GAIN. */
export function growSizeBy(size: number, amount: number) {
  return clampSize(size * (1 + Math.max(0, amount)))
}

export function ufoDiameter(size: number) {
  return UFO_BASE_DIAMETER * clampSize(size)
}

/**
 * How high the craft may fly, in metres.
 *
 * Not a wall - the flight model bleeds off climb as this is approached, so it
 * reads as the air thinning rather than as hitting an invisible ceiling.
 *
 * A small saucer is held down among the buildings, which is where its food is
 * and where the streets are worth threading. A grown one gets the sky, which
 * is where it wants to be anyway since it no longer fits between the towers.
 * The anti-air network only engages above 28m and only turns up late in the
 * run, so the altitude opening up and the anti-air arriving land together
 * without either having to be tuned against the other.
 */
export function maxAltitude(size: number) {
  const clamped = clampSize(size)
  return Math.min(DRONE_CEILING, 16 + Math.pow(clamped, 0.72) * 26)
}

/** Absolute ceiling, matching the flight model's own limit. */
export const DRONE_CEILING = 130

/**
 * How far the craft can see, as a multiplier on the fog distance.
 *
 * A grown craft flies high and covers ground fast, so a horizon set for a
 * saucer threading the streets closes in around it - the city visibly stops a
 * few blocks out. Pushing the fog back with size costs nothing (fog is a
 * shader constant) and the distant skyline it reveals is a single instanced
 * draw, so the world opening up as you grow is close to free.
 */
export function viewDistanceScale(size: number) {
  return 1 + Math.pow(clampSize(size), 0.55) * 0.34
}

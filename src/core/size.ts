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
 * Growing is not free, though. It still has two readable trade-offs:
 *
 * 1. A bigger craft is a bigger target. The hit radius scales, and since shots
 *    are led and fast enough to arrive, a grown craft holding a heading takes
 *    several times the fire a small one does. Weaving is the answer.
 * 2. A bigger craft gains integer beam strength, lift capacity and beam
 *    aperture. With the card deck gone these are size's job alone: every
 *    physical property of the beam is read straight off the hull, so "how
 *    strong am I" always has the same answer as "how big am I".
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
 * The normal beam's ground radius is 5.8m. Absorption must happen well inside
 * that cone, otherwise a large craft eats a load on the same frame it catches
 * it and the weight animation has no time to read.
 *
 * That readability argument is a small-craft argument, though: on a hull
 * eighty metres wide a 3.5m swallow window meant a catch travelled visibly
 * INTO the saucer before it counted, which read as a slow beam rather than a
 * careful one. The cap therefore opens with growth - see
 * ABSORB_DISTANCE_GROWN_BONUS in sizeProfile - while the opening craft keeps
 * the tight window that makes its first meals legible.
 */
export const ABSORB_DISTANCE_MAX = 3.48
/** Extra metres of swallow window a craft at the ceiling has earned. */
export const ABSORB_DISTANCE_GROWN_BONUS = 10.5
export const SIZE_CAMERA_LIFT_MAX = 7.5

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
  /** Beam cone radius multiplier. Grows with the hull - the cards that used
   *  to own this stat are gone. See beamApertureForSize. */
  beamScale: number
  /** Beam length multiplier on maxDrop, so a grown craft's cone actually
   *  reaches the street from its own cruising altitude. See beamReachForSize. */
  beamReach: number
  /** Pull-speed multiplier on the haul (BeamField.gripScale): a caught load
   *  rides a grown craft's beam visibly faster. See beamPullForSize. */
  beamPull: number
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
  /** Integer base pull strength, 0..7. */
  beamStrength: number
  /** Hanging weight the craft can keep aloft before lift-card bonuses. */
  liftCapacity: number
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
 * The twelve integer strength rungs shared by the HUD and beam simulation.
 *
 * This used to top out at 7 with cards adding up to +5 on the side; the cards
 * are gone, so the whole 1..12 ladder now lives on size alone. The heaviest
 * liftables keep their old meaning: a supertall block (mass 11) still needs a
 * craft near the ceiling, it just no longer needs a lucky deck as well.
 */
export const BEAM_STRENGTH_MAX = 12
/**
 * One. The opening saucer carries one unit of hanging weight and not a gram
 * more - a single trash bin is a full load, which is exactly the "barely a
 * predator" the start of the run is selling.
 */
export const LIFT_CAPACITY_MIN = 1
/** Forty by the ceiling. Self-limiting long before that: ballast drag prices
 *  a full hold at well under half speed, so the cap is ambition, not power. */
export const LIFT_CAPACITY_MAX = 40
/**
 * Below 1 so lift front-loads: the exponent lifts the early curve, putting
 * the opening craft past a car's worth of capacity within the first stretch
 * of growth instead of leaving it pinned at one bin for a quarter of the run.
 * The endpoints are untouched - pow(0) and pow(1) are still 0 and 1.
 */
export const LIFT_GROWTH_EXPONENT = 0.75

/** Beam cone multiplier at the ceiling, absorbing the old radius cards'
 *  headroom (x1.75) into growth itself. */
export const BEAM_APERTURE_MAX = 1.75
/**
 * Reach multiplier at the ceiling. The base beam stops 30m down (47 boosted),
 * which fits a saucer threading the streets and strands a grown one: its own
 * cruising altitude is higher than its beam is long, so the city it flies
 * over is out of reach. At full growth the cone runs ~83m (~130 boosted) -
 * the ceiling-height craft can genuinely fish the streets from the sky.
 */
export const BEAM_REACH_MAX = 2.75
/**
 * Pull-speed multiplier at the ceiling. Integer strength opens heavier rungs;
 * this is the other half the player actually feels - how fast a caught load
 * rides up the beam. A craft the size of a block hauling a car at opening-
 * saucer speed read as weakness, not care.
 *
 * 1.55, not the ~2.4x the haul actually gains: gripScale feeds the beam
 * spring twice (once in the spring constant, once in the drive), so the felt
 * speed-up is roughly this number squared.
 */
export const BEAM_PULL_MAX = 1.55

function sizeGrowthProgress(size: number) {
  return Math.max(0, Math.min(1, (clampSize(size) - SIZE_START) / (SIZE_MAX - SIZE_START)))
}

export function beamReachForSize(size: number) {
  return 1 + sizeGrowthProgress(size) * (BEAM_REACH_MAX - 1)
}

export function beamPullForSize(size: number) {
  return 1 + sizeGrowthProgress(size) * (BEAM_PULL_MAX - 1)
}

/**
 * Hearts earned by growing: none at the start, one a third of the way up the
 * size range, two from two-thirds on. Whole hearts at fixed rungs rather than
 * a sliding fraction, because a heart appearing on the HUD is a moment and a
 * creeping decimal is not. The base five stay in core/health; this is only
 * the growth bonus, capped at +2 for a seven-heart ceiling.
 */
export const HEALTH_BONUS_HEARTS_MAX = 2

export function bonusHeartsForSize(size: number) {
  return Math.min(HEALTH_BONUS_HEARTS_MAX, Math.floor(sizeGrowthProgress(size) * (HEALTH_BONUS_HEARTS_MAX + 1)))
}

export function beamStrengthForSize(size: number) {
  const clamped = clampSize(size)
  if (clamped < SIZE_START) return 0
  return Math.min(BEAM_STRENGTH_MAX, 1 + Math.round(sizeGrowthProgress(clamped) * (BEAM_STRENGTH_MAX - 1)))
}

export function liftCapacityForSize(size: number) {
  const progress = Math.pow(sizeGrowthProgress(size), LIFT_GROWTH_EXPONENT)
  return LIFT_CAPACITY_MIN + progress * (LIFT_CAPACITY_MAX - LIFT_CAPACITY_MIN)
}

export function beamApertureForSize(size: number) {
  return 1 + sizeGrowthProgress(size) * (BEAM_APERTURE_MAX - 1)
}

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
  const beamScale = beamApertureForSize(clamped)
  const beamStrength = beamStrengthForSize(clamped)
  return {
    size: clamped,
    ratio,
    beamScale,
    beamReach: beamReachForSize(clamped),
    beamPull: beamPullForSize(clamped),
    beamPower: beamStrength,
    beamStrength,
    liftCapacity: liftCapacityForSize(clamped),
    absorbDistance: Math.min(2.1 + clamped * 1.5, ABSORB_DISTANCE_MAX + sizeGrowthProgress(clamped) * ABSORB_DISTANCE_GROWN_BONUS),
    hitRadius: 1.05 * clamped,
    maxAltitude: maxAltitude(clamped),
    viewDistance: viewDistanceScale(clamped),
    cameraDistance: CAMERA_REST_DISTANCE * Math.pow(clamped, CAMERA_SIZE_EXPONENT),
    scoreMultiplier: clamped,
  }
}

/**
 * Raises the chase camera as the hull grows. The eased curve is intentionally
 * quiet at the opening size and spends most of its travel in the upper half
 * of the run, where the saucer would otherwise cover the aiming point.
 */
export function sizeCameraLift(size: number) {
  const progress = Math.max(0, Math.min(1, (clampSize(size) - SIZE_START) / (SIZE_MAX - SIZE_START)))
  return SIZE_CAMERA_LIFT_MAX * Math.pow(progress, 0.6)
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

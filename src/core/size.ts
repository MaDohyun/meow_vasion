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
 * Fully grown: the top of every ladder size owns.
 *
 * Not the ceiling - that is SIZE_MAX, and it sits a long way above. This is the
 * scale the progression is measured against: beam strength, lift, aperture,
 * reach, pull, bonus hearts, camera lift and the HUD ratio all reach their
 * maximum here and hold it. Growing past it is real growth - the hull, the
 * score multiplier, the swallow radius and the view all keep going - it simply
 * has no further rungs to hand out, because there is nothing left in the world
 * heavier than a dreadnought to open.
 *
 * 15, which is a saucer 81m across. A beginner is around 60m when their five
 * minutes are up, so this is what a strong run is reaching for rather than
 * where every run ends: the bot in test/feeding.spec.ts gets here at 3:49.
 */
export const SIZE_MATURE = 15
/** Visible width of the saucer at size 1. */
export const UFO_BASE_DIAMETER = 5.4
/** The ceiling, written where it can be read: a saucer 150 metres across. */
export const SIZE_MAX_DIAMETER = 150
/**
 * The ceiling - a real one, but placed past the end of a run rather than
 * inside it.
 *
 * It used to sit on SIZE_MATURE, and there it was the wrong shape for the
 * game: a player who fed well arrived inside three minutes and spent the rest
 * of the run at a fixed size, which turns the one thing the game is about into
 * something you finish early and then stop doing. So the two jobs are split.
 * SIZE_MATURE is where the ladders end; this is where the hull stops, and the
 * stretch between them is growth with no rungs left to hand out - the craft
 * is still getting bigger on the last body of the last second.
 *
 * The step ladder in growthFalloff keeps going the whole way up, so the last
 * bands are the expensive ones: 80m to 100m costs 94 pedestrians, 100m to 120m
 * costs 140, 120m to 140m costs 215. Getting from the mature 81m hull to the
 * ceiling is 624 more bodies - nine and a half minutes of uninterrupted
 * perfect feeding against a five minute run. A very strong run ends near 110m,
 * so the ceiling is close enough to be something a great run is visibly
 * climbing towards and far enough that meeting it is the story of that run
 * rather than a thing that happens on a Tuesday.
 *
 * 150m is enormous in the terms the city sets. The tallest tower in the game
 * stands 60m and a city cell is 34 units across, so a saucer at the ceiling is
 * two and a half times the height of the skyline and covers four blocks of it.
 */
export const SIZE_MAX = SIZE_MAX_DIAMETER / UFO_BASE_DIAMETER
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
 *
 * These are the rates a *small* craft eats at. They are the top of the curve,
 * not the whole of it - growthFalloff below tapers them as the hull fills out.
 *
 * These are only the opening rates. What a meal is actually worth is this
 * times growthFalloff, which steps down every twenty metres of hull - the
 * pacing lives in that ladder, and the anchor it is cut to is stated there.
 *
 * They were 0.046/0.076 when the run shipped, and that run was 81m across
 * inside ninety seconds.
 */
export const SIZE_GAIN = {
  pedestrian: 0.026,
  cat: 0.043,
} as const

export type SizeGainKind = keyof typeof SIZE_GAIN

/**
 * How much of the opening rate one step of growth costs you.
 *
 * The ladder replaced a smooth curve, and it replaced it because of what the
 * smooth one did to the opening: growth that only tapers by how far along the
 * range you are keeps essentially the full rate over the whole early game, so
 * the saucer left the streets before the player had seen them. The city is
 * full of things to look at from head height - traffic, shore props, the
 * forecourt of a gas station - and a hull that is through 40m in the first
 * minute is never at head height again.
 *
 * So the brake is hung on the hull itself. Every twenty metres of diameter the
 * rate takes a step down, and the steps are what the player feels: growing
 * visibly gets harder each time the saucer outgrows another slice of the city
 * rather than at some point on a curve nobody can see.
 */
export const GROWTH_STEP = 0.55
/** A step every twenty metres of hull - 20m, 40m, 60m and on up. */
export const GROWTH_STEP_DIAMETER = 20
/**
 * What a meal is worth at the very top, as a fraction of the opening rate.
 *
 * Derived rather than chosen: it is simply where seven steps of the ladder
 * land by the time the hull is at the 150m ceiling. Growth never stops - the
 * last stretch is meant to be a climb, not a wall - but a craft two and a half
 * times the height of the skyline should not put on another storey for the
 * handful of pedestrians that doubled it in the first ten seconds.
 */
export const GROWTH_FALLOFF_MIN = Math.pow(GROWTH_STEP, Math.floor(SIZE_MAX_DIAMETER / GROWTH_STEP_DIAMETER))

/** Which rung of the ladder a hull of this size is standing on. 0 below 20m. */
export function growthStep(size: number) {
  return Math.floor(ufoDiameter(size) / GROWTH_STEP_DIAMETER)
}

/**
 * Multiplier on every gain: 1 while the saucer is still street-sized, halving
 * again at every twenty metres of hull.
 *
 * The whole pacing anchor is in here, and it is stated in minutes because that
 * is the only unit worth arguing about: **a beginner who is trying should be
 * about 60m across when the five minutes run out.** Taking a beginner's intake
 * at roughly 0.6 bodies a second - a little over half what the steered bot in
 * test/feeding.spec.ts manages, since a person is also dodging, aiming and
 * reading the mission - GROWTH_STEP at 0.55 puts them at 20m at 2:17, 40m at
 * 3:38 and 60m at 5:05.
 *
 * The bands are deliberately uneven in metres and even in effort. A step costs
 * roughly the same number of meals as the one before it - 82, 49, 52, 67 - so
 * each new twenty metres is a comparable stretch of play rather than a
 * comparable amount of eating, which is what stops the hull running away from
 * the player once the meals themselves get bigger.
 */
export function growthFalloff(size: number) {
  return Math.pow(GROWTH_STEP, growthStep(size))
}

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
  /** Integer base pull strength, 0..BEAM_STRENGTH_MAX. */
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
 * The integer strength rungs shared by the HUD and beam simulation.
 *
 * This used to top out at 7 with cards adding up to +5 on the side; the cards
 * are gone, so the ladder lives on size alone. It then had to grow a second
 * storey, because the sky joined the menu: a helicopter weighs 6, a fighter
 * 10 and the dreadnought 30, and a ladder that stopped at 12 could never
 * reach the last of them however far the craft grew.
 *
 * The two storeys are deliberately unequal, see `beamStrengthForSize`.
 */
export const BEAM_STRENGTH_MAX = 30
/**
 * The top of the city ladder - the rung a supertall block (mass 11) sits
 * under, and the whole of what the old 1..12 range covered.
 */
export const BEAM_STRENGTH_CITY_RUNG = 12
/**
 * How much of the growth range the city ladder spends.
 *
 * The first eighty-five percent of growing buys rungs 1..12, which is the
 * street, the park and the skyline. The last fifteen buys 12..30, which is
 * nothing but the dreadnought and its escorts - and the last rung of it only
 * arrives within a whisker of the size cap, so eating the ship is the final
 * thing a run can do rather than something it passes on the way.
 *
 * The city ladder is slightly quicker than it was for the compression: a
 * supertall tower opens around 66% of the way up instead of 77%. That is the
 * price of the second storey, and it is charged where the run has already made
 * its point rather than at the start where the rungs teach.
 */
export const BEAM_STRENGTH_CITY_PROGRESS = 0.85
/**
 * Two: exactly one body.
 *
 * A pedestrian weighs 2 (see PEDESTRIAN_MASS) and a bin weighs 2 as well, so
 * this is the smallest rating at which the opening saucer's first catch is a
 * full load rather than an overload. It sat at 1, which meant the very first
 * thing a new player picked up put them over the line - alarm on, sinking,
 * top speed falling - before they had done anything wrong. A limit that is
 * breached by the tutorial's own lesson is not teaching a limit, it is just
 * noise.
 *
 * Still "barely a predator": one body at a time, and a second one is already
 * twice the rating.
 */
export const LIFT_CAPACITY_MIN = 2
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

/**
 * 0 at the opening size, 1 at SIZE_MATURE - and 1 for everything above it.
 *
 * Every ladder in this file rides on this, which is exactly why it normalises
 * against SIZE_MATURE rather than against the clamp: the rungs have to be
 * spent over the size range a run actually covers. Measured against SIZE_MAX
 * the whole progression would be squeezed into the first percent of the curve
 * and no run would ever leave beam strength 1.
 */
function sizeGrowthProgress(size: number) {
  return Math.max(0, Math.min(1, (clampSize(size) - SIZE_START) / (SIZE_MATURE - SIZE_START)))
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

/**
 * Two straight segments, not one.
 *
 * A single line from 1 to 30 would hand the opening saucer a car on its third
 * meal and a tower before half the run; a single line to 12 cannot reach the
 * ship at all. So the curve keeps the city ladder's shape over the bulk of
 * growth and spends the last stretch climbing to the ship.
 */
export function beamStrengthForSize(size: number) {
  const clamped = clampSize(size)
  if (clamped < SIZE_START) return 0
  const progress = sizeGrowthProgress(clamped)
  if (progress <= BEAM_STRENGTH_CITY_PROGRESS) {
    const city = progress / BEAM_STRENGTH_CITY_PROGRESS
    return Math.min(BEAM_STRENGTH_CITY_RUNG, 1 + Math.round(city * (BEAM_STRENGTH_CITY_RUNG - 1)))
  }
  const sky = (progress - BEAM_STRENGTH_CITY_PROGRESS) / (1 - BEAM_STRENGTH_CITY_PROGRESS)
  return Math.min(BEAM_STRENGTH_MAX, BEAM_STRENGTH_CITY_RUNG + Math.round(sky * (BEAM_STRENGTH_MAX - BEAM_STRENGTH_CITY_RUNG)))
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
  // Reads full at SIZE_MATURE and stays there. The HUD bar and the audio that
  // rides on it are showing "how far along the ladder", and past the last rung
  // the honest answer is "all the way" rather than a fraction of a clamp no
  // run will approach.
  const ratio = Math.min(1, Math.max(0, (clamped - SIZE_MIN) / (SIZE_MATURE - SIZE_MIN)))
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
  const progress = Math.max(0, Math.min(1, (clampSize(size) - SIZE_START) / (SIZE_MATURE - SIZE_START)))
  return SIZE_CAMERA_LIFT_MAX * Math.pow(progress, 0.6)
}

export function growSize(size: number, kind: SizeGainKind) {
  return growSizeBy(size, SIZE_GAIN[kind])
}

/** `amount` is a fraction of current size, matching SIZE_GAIN. Every source of
 *  growth goes through here, so the late-game taper applies to swallowed cars
 *  and buildings exactly as it does to pedestrians. */
export function growSizeBy(size: number, amount: number) {
  return clampSize(size * (1 + Math.max(0, amount) * growthFalloff(size)))
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

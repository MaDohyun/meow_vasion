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
 * Points per absorbed thing, and the one number each meal owns.
 *
 * Score and growth are the same fact told twice: what a thing is worth is what
 * it does to the hull. They used to be set apart from each other, and every
 * mismatch was a hole - rubble grew the craft four times faster than the tower
 * it fell off while paying a sixth of the points, and a lakeside pebble priced
 * at three points fed better than a pedestrian. A player reads the score
 * popup and learns nothing about what is actually growing them.
 *
 * So there is one value per meal, in points, and growth is that value times
 * GROWTH_PER_POINT. Everything absorbable now carries it: crowds here, props
 * and vehicles and aircraft where their score already lived.
 *
 * Weight is deliberately NOT in this relation. A bin, a boulder, a park tree
 * and a heap of rubble are heavy, awkward things worth nearly nothing, and
 * that is a fact about the city rather than an inconsistency: what the beam
 * strains to lift and what the survey pays for are different questions.
 */
export const CROWD_VALUE = {
  /** The staple, and the anchor the whole growth curve is tuned against. */
  pedestrian: 20,
  /**
   * A cat is worth a person and two thirds, in points and in hull alike -
   * which is what makes chasing the fast, evasive target worthwhile.
   */
  cat: 33,
} as const

/**
 * Hull growth bought by one point, as a fraction of current size.
 *
 * Set from the one anchor that cannot move: a pedestrian is 20 points and has
 * to stay worth 0.026, because that is what growthFalloff's whole pacing
 * ladder is cut against. Every other price in the game is then free to say
 * what it means - a 500 point mast IS a bigger meal than a 30 point bin, and
 * by exactly that ratio, up to the hull share cap in objectSizeGain.
 */
export const GROWTH_PER_POINT = 0.0013

/**
 * Growth per absorbed body, as a **fraction of current size**.
 *
 * Proportional rather than flat, for two reasons. It is how the fantasy
 * actually works - one person is an enormous meal for a saucer two metres wide
 * and nothing at all for one that is eighty - and flat gains cannot span the
 * range at all.
 *
 * Derived rather than written, so the crowd cannot drift away from its own
 * price: these are CROWD_VALUE at GROWTH_PER_POINT, and they come out at 0.026
 * and 0.043, which is where the pacing was tuned.
 *
 * These are only the opening rates. What a meal is actually worth is this
 * times growthFalloff, which steps down every twenty metres of hull - the
 * pacing lives in that ladder, and the anchor it is cut to is stated there.
 */
export const SIZE_GAIN = {
  pedestrian: CROWD_VALUE.pedestrian * GROWTH_PER_POINT,
  cat: CROWD_VALUE.cat * GROWTH_PER_POINT,
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
export const GROWTH_STEP = 0.5
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
 * reading the mission - GROWTH_STEP at 0.5 puts them at 20m at 2:17, 40m at
 * 3:45 and 60m at 5:27, so five minutes of that player is a hull around 54m.
 * A player who also swallows the odd car and bin is nearer 73m.
 *
 * The step went 0.55 -> 0.5 on the same complaint that produced the ladder:
 * the middle of the run was still arriving too quickly to enjoy the city from
 * inside it. Halving is also the shape the ladder wants - each twenty metres
 * of hull costs what the whole craft cost to build so far.
 *
 * The bands are deliberately uneven in metres and even in effort. A step costs
 * a little more than the one before it - 82, 54, 63, 89 - so each new twenty
 * metres is a comparable stretch of play rather than a comparable amount of
 * eating, which is what stops the hull running away from the player once the
 * meals themselves get bigger.
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
  /** Laser damage multiplier from the hull alone. See laserPowerForSize. */
  laserPower: number
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

/**
 * Where the craft starts carrying the laser, and by how much.
 *
 * The laser was the one thing growth did nothing for. Every other verb scales
 * with the craft - the cone widens, the reach lengthens, the haul quickens -
 * but a saucer the size of a block shot exactly as hard as the opening one,
 * so a player who never routed through a mystery circle spent the back half
 * of the run plinking at fighters with a starter gun.
 *
 * Written as the saucer's width across, because that is the thing being
 * described: a craft wide enough to shadow a street is what has earned a
 * heavier gun. Forty metres is a little over halfway up the growth range - the
 * opening saucer is 2.5m across and the ceiling is 81m - so it lands in the
 * stretch of the run where the sky stops being empty. Deriving the size from
 * it rather than writing both keeps the two from drifting apart if the base
 * diameter ever moves.
 *
 * A step rather than a curve. A ramp spread over the growth range would be a
 * laser that is always slightly different and never actually better; this is
 * a line the craft crosses once, after which fighters die in three shots
 * instead of four.
 *
 * Crossing it is not announced, for the same reason beam strength is not: what
 * growth buys is meant to be felt in the shooting, not read off a banner. The
 * pickups get callouts because they are a thing you flew to and took; this is
 * just the craft being bigger.
 */
export const LASER_POWER_DIAMETER = 40
export const LASER_POWER_SIZE = LASER_POWER_DIAMETER / UFO_BASE_DIAMETER
export const LASER_POWER_GROWN = 1.5

/** 1 below the threshold, LASER_POWER_GROWN at or above it. Multiplies with
 *  the mystery-circle laser pickup rather than replacing it, the same way the
 *  beam stats compose: a grown craft carrying the item hits for 2.25. */
export function laserPowerForSize(size: number) {
  return ufoDiameter(size) >= LASER_POWER_DIAMETER ? LASER_POWER_GROWN : 1
}

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
export const HEALTH_BONUS_HEARTS_MAX = 3

export function bonusHeartsForSize(size: number) {
  return Math.min(HEALTH_BONUS_HEARTS_MAX, Math.floor(sizeGrowthProgress(size) * (HEALTH_BONUS_HEARTS_MAX + 1)))
}

/**
 * How much faster a grown craft patches itself up, as a multiplier on
 * REGEN_RATE.
 *
 * The other half of what growing buys the pilot. Hearts are the ceiling and
 * this is the floor: a bigger craft is a bigger target and takes more hits by
 * simply existing, so a regeneration rate set for a saucer that could weave
 * through a street reads as a slow bleed once the hull cannot. Doubling by
 * full growth means the extra hearts are hearts the pilot can actually get
 * back rather than a longer bar to watch stay empty.
 *
 * A multiplier rather than a rung, unlike the hearts, because there is nothing
 * to announce - the pilot feels this as the bar coming back, and a number
 * appearing on the HUD would be telling them something they can see.
 */
export const HEALTH_REGEN_GROWN = 2

export function healthRegenForSize(size: number) {
  return 1 + sizeGrowthProgress(size) * (HEALTH_REGEN_GROWN - 1)
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
 * Doubling the craft pulls the camera back by seventy percent, not by double.
 *
 * The camera used to retreat faster than the craft grew - a twofold craft got
 * a 2.25-fold pull-back - so growing changed the picture without ever making
 * the player feel bigger, which is the one thing the whole run is about. Under
 * this exponent the saucer takes up more of the frame the larger it gets,
 * which is the point, while still leaving room to see what it is reaching for.
 *
 * It sat at 1.5, which lost that race by too much at the top of the range: a
 * ceiling-height hull is 81m across and the rig only stood 58m off it, so the
 * saucer was wider than the frame and the city it was hunting sat behind it.
 * Being big has to stay legible - if you cannot see what you are eating, the
 * reward for growing reads as a penalty. This keeps the hull growing on screen
 * across the whole run (32x of hull against 12x of camera) while leaving the
 * grown craft inside its own picture.
 */
export const CAMERA_GROWTH_PULL_BACK = 1.7
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
    laserPower: laserPowerForSize(clamped),
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

/**
 * Growth for swallowing one beam object, as a fraction of current size.
 *
 * Two terms, and the smaller one wins.
 *
 * The first is the meal's own price - `value` is the points it pays, and
 * points and hull are the same fact (see CROWD_VALUE). A 520 point mast grows
 * the craft twenty-six times what an 8 point bin does, which is what the
 * player already believed from watching the score.
 *
 * The second is the one the game needs to stay honest: **a meal is never
 * worth more than its share of the hull it fills.** Without it, growing opens
 * heavier and wider objects, so a craft that grew ate towers instead of
 * people, and a tower paid the same at every size - growing bought a faster
 * way of growing. The step ladder in growthFalloff cannot see that, because it
 * prices meals, not menus.
 *
 * The two terms swap over where the craft outgrows its food. Everything the
 * street-sized saucer can get its beam around is close to its own width, so
 * its price is the lower term and the opening game is the price list. Once the
 * hull dwarfs a thing, the share is what is left: a tower is worth a whole
 * pedestrian's growth to a 36m craft and a fifth of one to a 150m craft, and
 * it goes on paying its full points either way, because points are what the
 * late run is playing for.
 */
export const OBJECT_GAIN_HULL_SHARE = 0.06

export function objectSizeGain(value: number, objectDiameter: number, size: number) {
  const own = Math.max(0, value) * GROWTH_PER_POINT
  const hullShare = OBJECT_GAIN_HULL_SHARE * (Math.max(0, objectDiameter) / ufoDiameter(size))
  return Math.min(own, hullShare)
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

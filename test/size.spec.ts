import { describe, expect, it } from 'vitest'
import {
  ABSORB_DISTANCE_GROWN_BONUS,
  ABSORB_DISTANCE_MAX,
  BEAM_APERTURE_MAX,
  BEAM_PULL_MAX,
  BEAM_REACH_MAX,
  BEAM_STRENGTH_CITY_PROGRESS,
  BEAM_STRENGTH_CITY_RUNG,
  BEAM_STRENGTH_MAX,
  CAMERA_GROWTH_PULL_BACK,
  CAMERA_REST_DISTANCE,
  GROWTH_FALLOFF_MIN,
  GROWTH_STEP,
  HEALTH_BONUS_HEARTS_MAX,
  LIFT_CAPACITY_MIN,
  OBJECT_GAIN_BASE,
  OBJECT_GAIN_HULL_SHARE,
  OBJECT_GAIN_PER_METRE,
  SIZE_GAIN,
  SIZE_MATURE,
  SIZE_MAX,
  SIZE_MAX_DIAMETER,
  SIZE_MIN,
  SIZE_START,
  UFO_BASE_DIAMETER,
  beamStrengthForSize,
  bonusHeartsForSize,
  clampSize,
  growSize,
  growSizeBy,
  growthFalloff,
  growthStep,
  liftCapacityForSize,
  maxAltitude,
  objectSizeGain,
  sizeProfile,
  sizeCameraLift,
  ufoDiameter,
} from '../src/core/size'
import { PEDESTRIAN_MASS } from '../src/core/crowds'

describe('craft size as growth, not as health', () => {
  it('starts small enough that one person is a real meal', () => {
    // About three people wide. The old start was five metres across, which is
    // a car - swallowing a pedestrian at that size is housekeeping, not a meal.
    expect(ufoDiameter(SIZE_START)).toBeLessThan(3)
    expect(ufoDiameter(SIZE_START)).toBeGreaterThan(1.5)
    // And there is a whole run's worth of room above it.
    expect(SIZE_MATURE / SIZE_START).toBeGreaterThan(20)
  })

  it('never falls, whatever happens', () => {
    // Size stopped being health. A hit that shrank the craft was rewinding the
    // best part of the game, and once shots could actually land it turned
    // growing into a spiral: bigger target, more hits, smaller craft.
    expect(clampSize(SIZE_START - 5)).toBe(SIZE_MIN)
    expect(growSize(SIZE_START, 'cat')).toBeGreaterThan(SIZE_START)
    expect(growSizeBy(SIZE_START, 0)).toBe(SIZE_START)
  })

  it('steps the growth rate down every twenty metres of hull', () => {
    // The brake is hung on the hull, not on how far along the range you are.
    // A curve that only knew about progress kept nearly the full opening rate
    // over the whole early game, and the saucer was out of the streets before
    // the player had seen them - which is the part of the run that is about
    // looking at the city rather than about being bigger than it.
    expect(growthFalloff(SIZE_START)).toBeCloseTo(1, 5)
    const atDiameter = (metres: number) => growthFalloff(metres / UFO_BASE_DIAMETER)
    // Full rate right up to the first step, then a step at every twenty.
    expect(atDiameter(19.9)).toBeCloseTo(1, 5)
    expect(atDiameter(20.1)).toBeCloseTo(GROWTH_STEP, 5)
    expect(atDiameter(40.1)).toBeCloseTo(GROWTH_STEP ** 2, 5)
    expect(atDiameter(60.1)).toBeCloseTo(GROWTH_STEP ** 3, 5)
    // ...and the ladder keeps going above that rather than flattening off,
    // which is what keeps the ceiling out past the end of a run.
    expect(atDiameter(SIZE_MAX_DIAMETER)).toBeCloseTo(GROWTH_FALLOFF_MIN, 5)
    expect(GROWTH_FALLOFF_MIN).toBeLessThan(GROWTH_STEP ** 3)
    // Never rises, never reaches zero.
    let previous = Infinity
    for (let size = SIZE_START; size <= SIZE_MAX; size += 0.25) {
      const falloff = growthFalloff(size)
      expect(falloff).toBeLessThanOrEqual(previous)
      expect(falloff).toBeGreaterThan(0)
      previous = falloff
    }
    // Each band costs a comparable stretch of play. This is the point of
    // hanging the steps on diameter: without them the bands would get cheaper
    // as they went, because a proportional meal is worth more metres the
    // bigger the hull already is.
    const mealsBetween = (fromMetres: number, toMetres: number) => {
      let size = Math.max(SIZE_START, fromMetres / UFO_BASE_DIAMETER)
      let meals = 0
      while (ufoDiameter(size) < toMetres && meals < 10000) {
        size = growSize(size, 'pedestrian')
        meals += 1
      }
      return meals
    }
    const bands = [mealsBetween(0, 20), mealsBetween(20, 40), mealsBetween(40, 60), mealsBetween(60, 80)]
    for (const band of bands) {
      expect(band).toBeGreaterThan(35)
      expect(band).toBeLessThan(100)
    }
    // A grown craft still gains more absolute metres per meal than a small one
    // does; the ladder trims the rate, it does not invert it.
    expect(growSize(SIZE_MATURE * 0.5, 'pedestrian') - SIZE_MATURE * 0.5).toBeGreaterThan(
      growSize(SIZE_START, 'pedestrian') - SIZE_START,
    )
  })

  it('never pays a meal more than its share of the hull it goes into', () => {
    // The loop this closes: growing opens heavier and wider objects, so a craft
    // that grew ate towers instead of people - and a tower used to pay the same
    // five pedestrians at every size. Growing bought a faster way of growing,
    // which no taper on the meal itself can see, because the taper prices meals
    // and this was a change of menu.
    const TOWER = 18
    const pedestrian = SIZE_GAIN.pedestrian
    const at = (metres: number) => objectSizeGain(TOWER, metres / UFO_BASE_DIAMETER)
    // Dormant over the whole opening game. The things a street-sized saucer can
    // actually swallow - a bin, a bench, a car - are close enough to its own
    // width that their own value is the lower of the two, so nothing about the
    // first minutes changes. A bin is priced on itself until the hull is 9m,
    // a car until 11m.
    const ownValue = (metres: number) => OBJECT_GAIN_BASE + metres * OBJECT_GAIN_PER_METRE
    expect(objectSizeGain(1.7, SIZE_START)).toBeCloseTo(ownValue(1.7), 5)
    expect(objectSizeGain(1.7, 8 / UFO_BASE_DIAMETER)).toBeCloseTo(ownValue(1.7), 5)
    expect(objectSizeGain(2.9, 10 / UFO_BASE_DIAMETER)).toBeCloseTo(ownValue(2.9), 5)
    // A tower is the other case: it cannot be swallowed until the hull is
    // wider than it is, so by the time it is a legal meal the hull share is
    // already the binding term. That is the point - the biggest meals in the
    // game are exactly the ones the loop was built on.
    expect(at(18.1)).toBeLessThan(ownValue(TOWER))
    // ...and biting hard once the hull dwarfs its food.
    expect(at(20) / pedestrian).toBeGreaterThan(3)
    expect(at(60) / pedestrian).toBeLessThan(1.5)
    expect(at(150) / pedestrian).toBeLessThan(0.75)
    // Monotonic in both arguments: bigger meals are always worth more, and the
    // same meal is always worth less to a bigger craft.
    let previous = Infinity
    for (let metres = 10; metres <= SIZE_MAX_DIAMETER; metres += 2) {
      const gain = at(metres)
      expect(gain).toBeLessThanOrEqual(previous)
      expect(gain).toBeGreaterThan(0)
      previous = gain
    }
    for (const hull of [SIZE_START, 4, 12, SIZE_MATURE]) {
      expect(objectSizeGain(9, hull)).toBeGreaterThan(objectSizeGain(3, hull))
    }
    // A meal can never exceed the hull share, because the swallow gate already
    // refuses anything wider than the hull.
    expect(objectSizeGain(ufoDiameter(SIZE_MATURE), SIZE_MATURE)).toBeCloseTo(OBJECT_GAIN_HULL_SHARE, 5)
  })

  it('leaves a beginner about sixty metres across when the five minutes run out', () => {
    // The tuning anchor, in the only units worth arguing about: minutes and
    // metres. A beginner who is trying takes in roughly 0.6 bodies a second -
    // a little over half the steered bot in test/feeding.spec.ts, because a
    // person is also dodging, aiming and reading the mission.
    const BEGINNER_BODIES_PER_SECOND = 0.6
    const RUN_SECONDS = 300
    let size = SIZE_START
    const secondsAt: number[] = []
    for (let meal = 0; meal < 10000; meal += 1) {
      const before = growthStep(size)
      size = growSize(size, 'pedestrian')
      if (growthStep(size) > before) secondsAt.push(meal / BEGINNER_BODIES_PER_SECOND)
      if (meal / BEGINNER_BODIES_PER_SECOND >= RUN_SECONDS) break
    }
    // Five minutes of a beginner's feeding is a saucer around 60m across -
    // enormous next to the 2.5m it started at, and still under the 81m where
    // the stat ladders run out.
    expect(ufoDiameter(size)).toBeGreaterThan(50)
    expect(ufoDiameter(size)).toBeLessThan(70)
    expect(size).toBeLessThan(SIZE_MATURE)
    // The steps land spread through the run rather than all in the first
    // minute: 20m a bit past two minutes, 40m before four, 60m at the end.
    expect(secondsAt[0]).toBeGreaterThan(100)
    expect(secondsAt[0]).toBeLessThan(160)
    expect(secondsAt[1]).toBeGreaterThan(190)
    expect(secondsAt[1]).toBeLessThan(250)
    expect(secondsAt[2]).toBeGreaterThan(270)
  })

  it('puts the ceiling past the end of a run, not inside it', () => {
    // The ceiling is 150m of saucer - two and a half times the tallest tower in
    // the city - and it sits out beyond where a five minute run finishes. A player who fed at the bot's rate used to
    // arrive at the top inside three minutes and then fly a fixed-size craft
    // for the rest of the run, which stops the one thing the game is about. So
    // growth carries on past SIZE_MATURE at the floor rate - slow, but never
    // nothing, and never zero.
    expect(ufoDiameter(SIZE_MAX)).toBeCloseTo(150)
    expect(ufoDiameter(SIZE_MATURE)).toBe(81)
    let size = SIZE_MATURE
    for (let meal = 0; meal < 50; meal += 1) {
      const next = growSize(size, 'pedestrian')
      expect(next).toBeGreaterThan(size)
      size = next
    }
    // A whole run's worth of eating - 300 seconds at the steered bot's rate is
    // about 330 bodies - has to fall short of it, while still landing somewhere
    // enormous. That is the band the ceiling is placed for: a great run gets a
    // hull bigger than the skyline and can still see room above it.
    let fed = SIZE_START
    for (let meal = 0; meal < 332; meal += 1) fed = growSize(fed, 'pedestrian')
    expect(fed).toBeLessThan(SIZE_MAX * 0.8)
    expect(ufoDiameter(fed)).toBeGreaterThan(90)
    // The stat ladders do not care what happens up there: they are spent by
    // SIZE_MATURE and hold their last rung for ever.
    const mature = sizeProfile(SIZE_MATURE)
    const vast = sizeProfile(SIZE_MAX)
    expect(vast.beamStrength).toBe(mature.beamStrength)
    expect(vast.liftCapacity).toBeCloseTo(mature.liftCapacity)
    expect(vast.beamScale).toBeCloseTo(mature.beamScale)
    expect(vast.beamReach).toBeCloseTo(mature.beamReach)
    expect(vast.ratio).toBe(1)
    expect(bonusHeartsForSize(SIZE_MAX)).toBe(bonusHeartsForSize(SIZE_MATURE))
    // What does keep going is the hull itself, and the score for being it.
    expect(vast.scoreMultiplier).toBeGreaterThan(mature.scoreMultiplier)
    expect(ufoDiameter(SIZE_MAX)).toBeGreaterThan(ufoDiameter(SIZE_MATURE))
    // Growth is clamped, never NaN, and never falls off the end.
    expect(clampSize(SIZE_MAX * 2)).toBe(SIZE_MAX)
    expect(growSize(SIZE_MAX, 'pedestrian')).toBe(SIZE_MAX)
  })

  it('opens the world up as it grows', () => {
    // Height, view and camera all widen with size. A grown craft would not fit
    // between the towers anyway, so the sky opening up is less a reward than a
    // change of scenery - and it needs to see further because it is up there
    // covering ground faster.
    const start = sizeProfile(SIZE_START)
    const big = sizeProfile(SIZE_MATURE)
    expect(big.maxAltitude).toBeGreaterThan(start.maxAltitude)
    expect(big.viewDistance).toBeGreaterThan(start.viewDistance)
    // Even the smallest craft has to clear the low-rise band, or it cannot
    // move through the city at all.
    expect(start.maxAltitude).toBeGreaterThan(20)
    // Altitude rises with size at every step, never dips.
    let previous = 0
    for (let size = SIZE_START; size <= SIZE_MATURE; size += 0.2) {
      const altitude = maxAltitude(size)
      expect(altitude).toBeGreaterThanOrEqual(previous)
      previous = altitude
    }
  })

  it('climbs the city ladder first and the sky ladder last', () => {
    // Two storeys, deliberately unequal. The first eighty-five percent of
    // growing buys rungs 1..12 - the street, the park and the skyline - and
    // the last fifteen buys 12..30, which is nothing but the dreadnought and
    // its escorts.
    const at = (progress: number) => beamStrengthForSize(SIZE_START + (SIZE_MATURE - SIZE_START) * progress)
    expect(at(0)).toBe(1)
    expect(at(BEAM_STRENGTH_CITY_PROGRESS)).toBe(BEAM_STRENGTH_CITY_RUNG)
    expect(at(1)).toBe(BEAM_STRENGTH_MAX)

    // Never falls, and never skips the city on the way up.
    let previous = 0
    for (let progress = 0; progress <= 1; progress += 0.002) {
      const strength = at(progress)
      expect(strength).toBeGreaterThanOrEqual(previous)
      expect(strength - previous).toBeLessThanOrEqual(1)
      previous = strength
    }

    // The last rungs are the steep ones: half the ladder is spent in the last
    // sixth of the growth range, which is what keeps eating the ship the final
    // thing a run can do rather than something it passes on the way.
    expect(at(0.5)).toBeLessThan(BEAM_STRENGTH_CITY_RUNG)
    expect(at(0.9)).toBeLessThan(BEAM_STRENGTH_MAX - 10)
  })

  it('grows strength, lift and aperture off the hull alone', () => {
    // The card deck is gone: every beam number the player can grow now reads
    // straight off size, spanning the whole range the cards used to add.
    const start = sizeProfile(SIZE_START)
    const big = sizeProfile(SIZE_MATURE)
    expect(start.beamScale).toBe(1)
    expect(big.beamScale).toBeCloseTo(BEAM_APERTURE_MAX)
    expect(start.beamStrength).toBe(1)
    expect(big.beamStrength).toBe(BEAM_STRENGTH_MAX)
    expect(start.liftCapacity).toBe(LIFT_CAPACITY_MIN)
    // One body, and one body only: the opening craft's first catch must be a
    // full load rather than an overload.
    expect(LIFT_CAPACITY_MIN).toBe(PEDESTRIAN_MASS)
    expect(big.liftCapacity).toBe(40)
    expect(big.beamPower).toBeGreaterThan(start.beamPower)
    // Reach and pull ride on size too: the opening saucer keeps the stock
    // 30m street beam, the grown one fishes from its own cruising altitude
    // and hauls what it catches visibly faster.
    expect(start.beamReach).toBe(1)
    expect(big.beamReach).toBeCloseTo(BEAM_REACH_MAX)
    expect(start.beamPull).toBe(1)
    expect(big.beamPull).toBeCloseTo(BEAM_PULL_MAX)
    // The swallow window opens with the hull: tight on the opening craft so
    // its first meals read, wide on a block-sized one so a catch does not
    // travel into the saucer before it counts.
    expect(start.absorbDistance).toBeLessThanOrEqual(ABSORB_DISTANCE_MAX)
    expect(big.absorbDistance).toBeCloseTo(ABSORB_DISTANCE_MAX + ABSORB_DISTANCE_GROWN_BONUS)
    // And growing buys hearts: none at the start, the full +2 at the ceiling.
    expect(bonusHeartsForSize(SIZE_START)).toBe(0)
    expect(bonusHeartsForSize(SIZE_MATURE)).toBe(HEALTH_BONUS_HEARTS_MAX)
    expect(bonusHeartsForSize(SIZE_START + (SIZE_MATURE - SIZE_START) * 0.5)).toBe(1)
    expect(big.scoreMultiplier).toBeGreaterThan(start.scoreMultiplier)
    // ...and pays only by being a bigger target. Speed is deliberately not a
    // cost of growth; that tax belongs to beam ballast instead.
    expect(big.hitRadius).toBeGreaterThan(start.hitRadius)
  })

  it('front-loads lift so the opening craft escapes one-body capacity quickly', () => {
    // The curve's exponent sits below 1: early growth buys proportionally
    // more capacity than late growth, but the endpoints are exact.
    const quarter = SIZE_START + (SIZE_MATURE - SIZE_START) * 0.25
    const linearQuarter = LIFT_CAPACITY_MIN + 0.25 * (40 - LIFT_CAPACITY_MIN)
    expect(liftCapacityForSize(quarter)).toBeGreaterThan(linearQuarter)
    let previous = 0
    for (let size = SIZE_START; size <= SIZE_MATURE; size += 0.2) {
      const capacity = liftCapacityForSize(size)
      expect(capacity).toBeGreaterThanOrEqual(previous)
      previous = capacity
    }
  })

  it('never charges speed for growing', () => {
    // Growth is what the player is good at. Taxing it directly punishes them
    // for succeeding, on a curve they cannot influence; the speed penalty lives
    // on hanging ballast, which is answerable with beam discipline.
    expect('drag' in sizeProfile(SIZE_MATURE)).toBe(false)
  })

  it('pulls the camera back by half again per doubling, not by double', () => {
    // The camera used to retreat faster than the craft grew, so growing changed
    // the picture without ever making the player feel bigger - which is the one
    // thing the run is about. Asserted as the ratio rather than as distances so
    // retuning the rest distance cannot quietly undo it.
    for (const size of [0.7, 1, 1.4]) {
      expect(sizeProfile(size * 2).cameraDistance / sizeProfile(size).cameraDistance)
        .toBeCloseTo(CAMERA_GROWTH_PULL_BACK, 6)
    }
    // Growing still pulls back - it just loses the race with the hull, which is
    // what puts more saucer on screen the bigger it gets.
    expect(sizeProfile(SIZE_MATURE).cameraDistance).toBeGreaterThan(sizeProfile(SIZE_START).cameraDistance)
    expect(CAMERA_GROWTH_PULL_BACK).toBeLessThan(2)
    // The rest distance is the rig at size 1; the opening saucer is smaller
    // than that, so the camera starts in closer - which is the whole point of
    // starting small.
    expect(sizeProfile(1).cameraDistance).toBeCloseTo(CAMERA_REST_DISTANCE)
    expect(sizeProfile(SIZE_START).cameraDistance).toBeLessThan(CAMERA_REST_DISTANCE)
    expect(ufoDiameter(SIZE_MATURE) / 3).toBeGreaterThan(5)
  })

  it('raises the camera gently at first and more at the largest hull', () => {
    expect(sizeCameraLift(SIZE_START)).toBe(0)
    expect(sizeCameraLift(4)).toBeGreaterThan(sizeCameraLift(1))
    expect(sizeCameraLift(SIZE_MATURE)).toBeGreaterThan(sizeCameraLift(4))
    expect(sizeCameraLift(SIZE_MATURE)).toBeLessThan(8)
  })

  it('keeps the absorption window monotonic and inside its grown ceiling', () => {
    let previous = 0
    for (let size = SIZE_START; size <= SIZE_MATURE; size += 0.2) {
      const distance = sizeProfile(size).absorbDistance
      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThanOrEqual(ABSORB_DISTANCE_MAX + ABSORB_DISTANCE_GROWN_BONUS)
      expect(distance).toBeGreaterThanOrEqual(previous)
      previous = distance
    }
  })



  it('reports ratio from the death threshold, not from zero', () => {
    expect(sizeProfile(SIZE_MIN).ratio).toBe(0)
    expect(sizeProfile(SIZE_MATURE).ratio).toBe(1)
  })
})

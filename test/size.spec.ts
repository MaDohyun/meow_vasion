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
  HEALTH_BONUS_HEARTS_MAX,
  LIFT_CAPACITY_MIN,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_START,
  beamStrengthForSize,
  bonusHeartsForSize,
  clampSize,
  growSize,
  growSizeBy,
  growthFalloff,
  liftCapacityForSize,
  maxAltitude,
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
    expect(SIZE_MAX / SIZE_START).toBeGreaterThan(20)
  })

  it('never falls, whatever happens', () => {
    // Size stopped being health. A hit that shrank the craft was rewinding the
    // best part of the game, and once shots could actually land it turned
    // growing into a spiral: bigger target, more hits, smaller craft.
    expect(clampSize(SIZE_START - 5)).toBe(SIZE_MIN)
    expect(growSize(SIZE_START, 'cat')).toBeGreaterThan(SIZE_START)
    expect(growSizeBy(SIZE_START, 0)).toBe(SIZE_START)
  })

  it('opens fast and tapers once the hull is huge', () => {
    // The first meals have to land visibly - the opening saucer is the one
    // place a single pedestrian should read as an event - while the top of the
    // range has to stay a climb. Purely proportional growth did the opposite:
    // each meal was worth more metres than the last, so the ceiling arrived in
    // a rush after a slow start.
    const mealsToReach = (from: number, to: number) => {
      let size = from
      let meals = 0
      while (size < to && meals < 10000) {
        size = growSize(size, 'pedestrian')
        meals += 1
      }
      return meals
    }
    const span = SIZE_MAX - SIZE_START
    const firstThird = mealsToReach(SIZE_START, SIZE_START + span * 0.3)
    const lastThird = mealsToReach(SIZE_START + span * 0.7, SIZE_MAX)
    // The opening is the generous end now, but the taper has to bite hard
    // enough that the last stretch is not a formality. The bounds moved out
    // with the SIZE_GAIN trim: the shape of the curve is the same, it just
    // buys the same range with about a quarter more meals.
    expect(lastThird).toBeGreaterThan(15)
    expect(firstThird).toBeLessThan(80)
    // Still a reachable ceiling inside one run's worth of eating.
    expect(mealsToReach(SIZE_START, SIZE_MAX)).toBeLessThan(140)
    // Growth never stops, it only slows - and it slows monotonically.
    expect(growthFalloff(SIZE_START)).toBeCloseTo(1, 5)
    expect(growthFalloff(SIZE_MAX)).toBeCloseTo(GROWTH_FALLOFF_MIN, 5)
    let previous = Infinity
    for (let size = SIZE_START; size <= SIZE_MAX; size += 0.25) {
      const falloff = growthFalloff(size)
      expect(falloff).toBeLessThanOrEqual(previous)
      expect(falloff).toBeGreaterThan(0)
      previous = falloff
    }
    // A grown craft still gains more absolute metres per meal than a small one
    // does; the taper trims the curve, it does not invert it.
    expect(growSize(SIZE_MAX * 0.5, 'pedestrian') - SIZE_MAX * 0.5).toBeGreaterThan(
      growSize(SIZE_START, 'pedestrian') - SIZE_START,
    )
  })

  it('opens the world up as it grows', () => {
    // Height, view and camera all widen with size. A grown craft would not fit
    // between the towers anyway, so the sky opening up is less a reward than a
    // change of scenery - and it needs to see further because it is up there
    // covering ground faster.
    const start = sizeProfile(SIZE_START)
    const big = sizeProfile(SIZE_MAX)
    expect(big.maxAltitude).toBeGreaterThan(start.maxAltitude)
    expect(big.viewDistance).toBeGreaterThan(start.viewDistance)
    // Even the smallest craft has to clear the low-rise band, or it cannot
    // move through the city at all.
    expect(start.maxAltitude).toBeGreaterThan(20)
    // Altitude rises with size at every step, never dips.
    let previous = 0
    for (let size = SIZE_START; size <= SIZE_MAX; size += 0.2) {
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
    const at = (progress: number) => beamStrengthForSize(SIZE_START + (SIZE_MAX - SIZE_START) * progress)
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
    const big = sizeProfile(SIZE_MAX)
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
    expect(bonusHeartsForSize(SIZE_MAX)).toBe(HEALTH_BONUS_HEARTS_MAX)
    expect(bonusHeartsForSize(SIZE_START + (SIZE_MAX - SIZE_START) * 0.5)).toBe(1)
    expect(big.scoreMultiplier).toBeGreaterThan(start.scoreMultiplier)
    // ...and pays only by being a bigger target. Speed is deliberately not a
    // cost of growth; that tax belongs to beam ballast instead.
    expect(big.hitRadius).toBeGreaterThan(start.hitRadius)
  })

  it('front-loads lift so the opening craft escapes one-body capacity quickly', () => {
    // The curve's exponent sits below 1: early growth buys proportionally
    // more capacity than late growth, but the endpoints are exact.
    const quarter = SIZE_START + (SIZE_MAX - SIZE_START) * 0.25
    const linearQuarter = LIFT_CAPACITY_MIN + 0.25 * (40 - LIFT_CAPACITY_MIN)
    expect(liftCapacityForSize(quarter)).toBeGreaterThan(linearQuarter)
    let previous = 0
    for (let size = SIZE_START; size <= SIZE_MAX; size += 0.2) {
      const capacity = liftCapacityForSize(size)
      expect(capacity).toBeGreaterThanOrEqual(previous)
      previous = capacity
    }
  })

  it('never charges speed for growing', () => {
    // Growth is what the player is good at. Taxing it directly punishes them
    // for succeeding, on a curve they cannot influence; the speed penalty lives
    // on hanging ballast, which is answerable with beam discipline.
    expect('drag' in sizeProfile(SIZE_MAX)).toBe(false)
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
    expect(sizeProfile(SIZE_MAX).cameraDistance).toBeGreaterThan(sizeProfile(SIZE_START).cameraDistance)
    expect(CAMERA_GROWTH_PULL_BACK).toBeLessThan(2)
    // The rest distance is the rig at size 1; the opening saucer is smaller
    // than that, so the camera starts in closer - which is the whole point of
    // starting small.
    expect(sizeProfile(1).cameraDistance).toBeCloseTo(CAMERA_REST_DISTANCE)
    expect(sizeProfile(SIZE_START).cameraDistance).toBeLessThan(CAMERA_REST_DISTANCE)
    expect(ufoDiameter(SIZE_MAX) / 3).toBeGreaterThan(5)
  })

  it('raises the camera gently at first and more at the largest hull', () => {
    expect(sizeCameraLift(SIZE_START)).toBe(0)
    expect(sizeCameraLift(4)).toBeGreaterThan(sizeCameraLift(1))
    expect(sizeCameraLift(SIZE_MAX)).toBeGreaterThan(sizeCameraLift(4))
    expect(sizeCameraLift(SIZE_MAX)).toBeLessThan(8)
  })

  it('keeps the absorption window monotonic and inside its grown ceiling', () => {
    let previous = 0
    for (let size = SIZE_START; size <= SIZE_MAX; size += 0.2) {
      const distance = sizeProfile(size).absorbDistance
      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThanOrEqual(ABSORB_DISTANCE_MAX + ABSORB_DISTANCE_GROWN_BONUS)
      expect(distance).toBeGreaterThanOrEqual(previous)
      previous = distance
    }
  })



  it('reports ratio from the death threshold, not from zero', () => {
    expect(sizeProfile(SIZE_MIN).ratio).toBe(0)
    expect(sizeProfile(SIZE_MAX).ratio).toBe(1)
  })
})

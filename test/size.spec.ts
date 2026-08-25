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
  LASER_POWER_DIAMETER,
  LASER_POWER_GROWN,
  LASER_POWER_SIZE,
  LIFT_CAPACITY_MIN,
  CROWD_VALUE,
  GROWTH_PER_POINT,
  OBJECT_GAIN_HULL_SHARE,
  SIZE_GAIN,
  SIZE_MATURE,
  SIZE_MAX,
  SIZE_MAX_DIAMETER,
  SIZE_MIN,
  SIZE_START,
  UFO_BASE_DIAMETER,
  beamStrengthForSize,
  bonusHeartsForSize,
  laserPowerForSize,
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
import { BOON_DEFINITIONS } from '../src/core/boons'
import { ENEMY_MAX_HP } from '../src/core/enemies'

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

  it('pays score and growth from the same number', () => {
    // One value per meal. What a thing is worth to the survey is what it is
    // worth to the hull, so a player who reads the score popup has been told
    // what is growing them. They used to be separate figures, and every gap
    // was a hole: rubble grew the craft four times faster than the tower it
    // fell off while paying a sixth of the points.
    // Priced at the hull's own width, so the share cap in the next test is not
    // what is being measured here.
    const growthOf = (value: number) => objectSizeGain(value, ufoDiameter(SIZE_START), SIZE_START)
    expect(growthOf(CROWD_VALUE.pedestrian)).toBeCloseTo(SIZE_GAIN.pedestrian, 10)
    expect(growthOf(40) / growthOf(20)).toBeCloseTo(2, 10)
    expect(growthOf(45) / growthOf(9)).toBeCloseTo(5, 10)
    expect(SIZE_GAIN.cat / SIZE_GAIN.pedestrian).toBeCloseTo(CROWD_VALUE.cat / CROWD_VALUE.pedestrian, 10)
    // Weight is deliberately outside the relation - a boulder, a bin and a
    // heap of rubble are heavy things worth nearly nothing, which is a fact
    // about the city rather than an inconsistency.
    expect(objectSizeGain(8, 1.7, SIZE_START)).toBeLessThan(SIZE_GAIN.pedestrian)
  })

  it('never pays a meal more than its share of the hull it goes into', () => {
    // The loop this closes: growing opens heavier and wider objects, so a craft
    // that grew ate towers instead of people - and a tower used to pay the same
    // growth at every size. Growing bought a faster way of growing, which no
    // taper on the meal itself can see, because the taper prices meals and this
    // was a change of menu.
    const TOWER = { value: 380, metres: 18 }
    const pedestrian = SIZE_GAIN.pedestrian
    const at = (hullMetres: number) => objectSizeGain(TOWER.value, TOWER.metres, hullMetres / UFO_BASE_DIAMETER)
    // Dormant over the whole opening game: the things a street-sized saucer can
    // actually swallow are close enough to its own width that their own price
    // is the lower of the two.
    expect(objectSizeGain(8, 1.7, SIZE_START)).toBeCloseTo(8 * GROWTH_PER_POINT, 10)
    expect(objectSizeGain(70, 2.9, 6 / UFO_BASE_DIAMETER)).toBeLessThan(70 * GROWTH_PER_POINT)
    // ...and biting hard once the hull dwarfs its food.
    expect(at(36) / pedestrian).toBeGreaterThan(0.9)
    expect(at(36) / pedestrian).toBeLessThan(1.5)
    expect(at(150) / pedestrian).toBeLessThan(0.35)
    // Monotonic in both arguments: bigger meals are always worth more, and the
    // same meal is always worth less to a bigger craft.
    let previous = Infinity
    for (let metres = 18; metres <= SIZE_MAX_DIAMETER; metres += 2) {
      const gain = at(metres)
      expect(gain).toBeLessThanOrEqual(previous)
      expect(gain).toBeGreaterThan(0)
      previous = gain
    }
    for (const hull of [SIZE_START, 4, 12, SIZE_MATURE]) {
      expect(objectSizeGain(400, 9, hull)).toBeGreaterThan(objectSizeGain(40, 3, hull))
    }
    // A meal can never exceed the hull share, because the swallow gate already
    // refuses anything wider than the hull.
    expect(objectSizeGain(99999, ufoDiameter(SIZE_MATURE), SIZE_MATURE)).toBeCloseTo(OBJECT_GAIN_HULL_SHARE, 10)
  })

  it('nerfs the rubble that used to outrun the building it fell off', () => {
    // Rubble is five units of dead lift for eighteen points. The hole was that
    // growth read its eighteen metres of footprint instead of its price.
    const RUBBLE = { value: 18, metres: 18 }
    const TOWER = { value: 380, metres: 18 }
    const hull = 18 / UFO_BASE_DIAMETER
    expect(objectSizeGain(RUBBLE.value, RUBBLE.metres, hull))
      .toBeLessThan(objectSizeGain(TOWER.value, TOWER.metres, hull))
    // ...and less than the pedestrian it is a thousand times the size of.
    expect(objectSizeGain(RUBBLE.value, RUBBLE.metres, hull)).toBeLessThan(SIZE_GAIN.pedestrian)
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
    // Five minutes of a beginner's feeding is a saucer in the fifties - and
    // nearer 70m for one who also swallows the odd car - which is enormous
    // next to the 2.5m it started at and still under the 81m where the stat
    // ladders run out.
    expect(ufoDiameter(size)).toBeGreaterThan(45)
    expect(ufoDiameter(size)).toBeLessThan(65)
    expect(size).toBeLessThan(SIZE_MATURE)
    // The steps land spread through the run rather than all in the first
    // minute: 20m a bit past two minutes, 40m before four, and the third one
    // out past the end of the run - a beginner crosses two of these, which is
    // the point. A player who crosses three inside five minutes was fed a lot
    // better than this one.
    expect(secondsAt).toHaveLength(2)
    expect(secondsAt[0]).toBeGreaterThan(100)
    expect(secondsAt[0]).toBeLessThan(160)
    expect(secondsAt[1]).toBeGreaterThan(190)
    expect(secondsAt[1]).toBeLessThan(260)
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
    expect(fed).toBeLessThan(SIZE_MAX * 0.7)
    expect(ufoDiameter(fed)).toBeGreaterThan(75)
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
    // And growing buys hearts: none at the start, the full +3 by full growth,
    // one at each quarter of the way up. Five base plus three is an eight
    // heart craft, which is what a hull that cannot weave any more needs.
    expect(bonusHeartsForSize(SIZE_START)).toBe(0)
    expect(bonusHeartsForSize(SIZE_MATURE)).toBe(HEALTH_BONUS_HEARTS_MAX)
    expect(bonusHeartsForSize(SIZE_START + (SIZE_MATURE - SIZE_START) * 0.5)).toBe(2)
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

  it('pulls the camera back by less than the craft grows, but far enough to frame it', () => {
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
    // ...and the grown craft has to fit in its own picture. A hull that is
    // wider than the rig stands back is a hull you cannot see past, so the
    // ceiling-height saucer keeps its whole diameter inside the chase
    // distance - the reason the pull-back was raised from 1.5.
    expect(sizeProfile(SIZE_MAX).cameraDistance).toBeGreaterThan(ufoDiameter(SIZE_MAX))
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

describe('the hull carrying the laser', () => {
  it('is a width, and switches on at forty metres across', () => {
    // The threshold is stated as the saucer's width because that is what it
    // describes, so the guard is a width too - a size number that happened to
    // match today would say nothing if the base diameter moved.
    expect(ufoDiameter(LASER_POWER_SIZE)).toBeCloseTo(LASER_POWER_DIAMETER)
    expect(laserPowerForSize(SIZE_START)).toBe(1)
    expect(ufoDiameter(SIZE_START)).toBeLessThan(LASER_POWER_DIAMETER)
    expect(laserPowerForSize(LASER_POWER_SIZE - 0.01)).toBe(1)
    expect(laserPowerForSize(LASER_POWER_SIZE)).toBe(LASER_POWER_GROWN)
    expect(laserPowerForSize(SIZE_MAX)).toBe(LASER_POWER_GROWN)
    expect(sizeProfile(LASER_POWER_SIZE).laserPower).toBe(LASER_POWER_GROWN)
    // Inside the run rather than at either end: before it a player is plinking
    // at fighters with a starter gun, and at the top of the ladder it would
    // arrive too late to have been worth growing for. Measured against
    // SIZE_MATURE like every other rung - SIZE_MAX is the 150m ceiling out
    // past the end of a run, and nothing is paced against that.
    const progress = (LASER_POWER_SIZE - SIZE_START) / (SIZE_MATURE - SIZE_START)
    expect(progress).toBeGreaterThan(0.3)
    expect(progress).toBeLessThan(0.65)
  })

  it('spends shots the way the wave ladder expects', () => {
    // The whole point of the size step and of the HP numbers, said in shots
    // rather than multipliers. hitEnemy subtracts damage and kills at zero, so
    // this is ceil(hp/damage) - and every number below is one a player counts.
    const shots = (hp: number, damage: number) => Math.ceil(hp / damage)
    const grown = LASER_POWER_GROWN
    const item = 1 + BOON_DEFINITIONS['laser-power'].step

    // A starter craft: three shots for a fighter.
    expect(shots(ENEMY_MAX_HP.fighter, 1)).toBe(3)
    // Grown past forty metres, and it is two - without having found a single
    // mystery circle. That is what growth is being paid for here.
    expect(shots(ENEMY_MAX_HP.fighter, grown)).toBe(2)
    // The item alone does the same, and the two together do not go below two:
    // a fighter is never a one-shot, so it always has to be flown at twice.
    expect(shots(ENEMY_MAX_HP.fighter, item)).toBe(2)
    expect(shots(ENEMY_MAX_HP.fighter, grown * item)).toBe(2)
    // Helicopters are two shots for anyone, and one only for a grown craft
    // that also took the item - the sky's cheapest real target.
    expect(shots(ENEMY_MAX_HP.helicopter, 1)).toBe(2)
    expect(shots(ENEMY_MAX_HP.helicopter, grown)).toBe(2)
    expect(shots(ENEMY_MAX_HP.helicopter, grown * item)).toBe(1)
    // Mines still pop on one, whatever the laser is.
    expect(shots(ENEMY_MAX_HP.drone, 1)).toBe(1)
    // The dreadnought stays a real fight rather than a formality: twenty shots
    // even for a grown craft carrying the item, and forty-four for a starter.
    expect(shots(ENEMY_MAX_HP.boss, 1)).toBe(44)
    expect(shots(ENEMY_MAX_HP.boss, grown)).toBe(30)
    expect(shots(ENEMY_MAX_HP.boss, grown * item)).toBe(20)
    // And it stays the sky's longest fight by a wide margin.
    expect(shots(ENEMY_MAX_HP.boss, grown)).toBeGreaterThan(shots(ENEMY_MAX_HP.fighter, grown) * 10)
  })
})

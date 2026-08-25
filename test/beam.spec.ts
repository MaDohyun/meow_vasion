import { describe, expect, it } from 'vitest'
import {
  BEAM_MIN_GRIP,
  type BeamField,
  type BeamObject,
  CAR_MASS,
  absorptionScore,
  beamGrip,
  beamLiftBand,
  beamLiftScale,
  beamProfile,
  beamVisualLength,
  beginNearbyBeamObjectAbsorption,
  beginTrashBinLaunch,
  isInsideBeam,
  stepBeamObjects,
} from '../src/core/beam'
import { CAT_MASS, PEDESTRIAN_MASS } from '../src/core/crowds'
import { SIZE_MATURE, SIZE_MIN, SIZE_START, UFO_BASE_DIAMETER, maxAltitude, sizeProfile, ufoDiameter } from '../src/core/size'

const makeCar = (id = 'car-1', x = 0, y = 0.65, z = 0): BeamObject => ({
  id,
  kind: 'car',
  mass: 2.4,
  color: '#ff5d74',
  position: { x, y, z },
  velocity: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  angularVelocity: { x: 0, y: 0, z: 0 },
  active: true,
  inBeam: false,
  tether: 0,
  playerTouched: false,
  destroying: false,
  destroyTimer: 0,
  explosionPending: false,
  absorbing: false,
  absorbTimer: 0,
})

const field = (boosting = false): BeamField => ({
  active: true,
  boosting,
  position: { x: 0, y: 7, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
})

describe('tractor beam physics', () => {
  it('lifts every car inside the beam cone', () => {
    const cars = [makeCar('one', -2), makeCar('two', 0), makeCar('three', 2)]
    for (let frame = 0; frame < 30; frame += 1) stepBeamObjects(cars, field(), 1 / 60)
    expect(cars.every((car) => car.inBeam)).toBe(true)
    expect(cars.every((car) => car.position.y > 1)).toBe(true)
  })

  it('widens the cone and strongly matches boost velocity', () => {
    const normal = makeCar('same-car')
    const boosted = makeCar('same-car')
    const normalField = field(false)
    const boostField = field(true)
    normalField.velocity.x = 42
    boostField.velocity.x = 42
    stepBeamObjects([normal], normalField, 1 / 30)
    stepBeamObjects([boosted], boostField, 1 / 30)
    expect(beamProfile(true).baseRadius).toBeGreaterThan(beamProfile(false).baseRadius)
    expect(boosted.velocity.x).toBeGreaterThan(normal.velocity.x * 1.45)
  })

  it('keeps radius scaling and reach scaling on separate axes', () => {
    // Widening the cone must not lengthen it. Asserted as a relationship rather
    // than against fixed numbers, so retuning the beam does not break the test
    // that guards the property.
    expect(beamProfile(false, 1.5).baseRadius).toBeCloseTo(beamProfile(false).baseRadius * 1.5)
    expect(beamProfile(false, 1.5).coneSpread).toBeCloseTo(beamProfile(false).coneSpread * 1.5)
    expect(beamProfile(false, 1.5).maxDrop).toBe(beamProfile(false).maxDrop)

    expect(beamProfile(false, 1, 2).maxDrop).toBeCloseTo(beamProfile(false).maxDrop * 2)
    expect(beamProfile(false, 1, 2).baseRadius).toBeCloseTo(beamProfile(false).baseRadius)
    expect(beamProfile(true).maxDrop).toBeGreaterThan(beamProfile(false).maxDrop)
  })

  it('widens the beam with growth but keeps its length out of it', () => {
    // Aperture rides on size now that the radius cards are gone; reach stays
    // put, so a bigger craft sweeps a wider cone, not a longer one.
    const small = sizeProfile(SIZE_MIN)
    const large = sizeProfile(SIZE_MATURE)
    expect(large.beamScale).toBeGreaterThan(small.beamScale)
    expect(beamProfile(false, large.beamScale).baseRadius)
      .toBeGreaterThan(beamProfile(false, small.beamScale).baseRadius)
    expect(beamProfile(false, large.beamScale).maxDrop)
      .toBe(beamProfile(false, small.beamScale).maxDrop)
  })

  it('stops a short beam above ground that an upgraded one reaches', () => {
    const stock = beamProfile(false, 1, 1).maxDrop
    const upgraded = beamProfile(false, 1, 1.9).maxDrop
    expect(stock).toBeLessThan(upgraded)
    // Hovering at a height the upgraded beam covers and the stock one does
    // not: the stock beam has to end in mid-air rather than touch the street.
    const altitude = (stock + upgraded) / 2
    expect(beamVisualLength(altitude, stock)).toBe(stock)
    expect(beamVisualLength(altitude, stock)).toBeLessThan(altitude - 0.15)
    expect(beamVisualLength(altitude, upgraded)).toBeCloseTo(altitude - 0.15)
  })

  it('keeps visual length tied to ground and range rather than a lifted target', () => {
    expect(beamVisualLength(12, beamProfile(false).maxDrop)).toBeCloseTo(11.85)
    expect(beamVisualLength(80, beamProfile(false).maxDrop)).toBe(beamProfile(false).maxDrop)
    expect(beamVisualLength(80, beamProfile(true).maxDrop)).toBe(beamProfile(true).maxDrop)
  })

  it('reaches the street from the opening craft\'s own ceiling', () => {
    // These two numbers were 30 and 30.9, which meant a beginner who climbed
    // to clear a mid-rise roof was flying at exactly the height where the beam
    // stopped touching the ground. The one verb the game has must work
    // anywhere the craft can actually be.
    const opening = sizeProfile(SIZE_START)
    const reach = beamProfile(false, opening.beamScale, opening.beamReach).maxDrop
    expect(reach).toBeGreaterThan(maxAltitude(SIZE_START) + 6)
    // Reach only. The haul from out there is as slow as it ever was - flying
    // low is still how you eat quickly.
    expect(beamGrip(maxAltitude(SIZE_START), reach)).toBeLessThan(0.2)
  })

  it('still weakens toward the far end of whatever reach it has', () => {
    // Reach changed; falloff did not. The far end of the cone must stay weak,
    // or the beam becomes a rigid rod that happens to be shorter.
    const reach = beamProfile(false).maxDrop
    expect(beamGrip(0, reach)).toBeGreaterThan(beamGrip(reach * 0.5, reach))
    expect(beamGrip(reach * 0.5, reach)).toBeGreaterThan(beamGrip(reach, reach))
    expect(beamGrip(reach, reach)).toBeCloseTo(BEAM_MIN_GRIP)
  })

  it('lifts a heavy car more slowly than a light object', () => {
    const light = makeCar('light')
    const heavy = makeCar('heavy')
    light.mass = 0.8
    heavy.mass = 2.4
    for (let frame = 0; frame < 30; frame += 1) stepBeamObjects([light, heavy], field(), 1 / 60)
    expect(light.position.y).toBeGreaterThan(heavy.position.y + 0.2)
    expect(heavy.position.y).toBeGreaterThan(0.7)
  })

  it('never keeps hold of a load it cannot lift, so growth does not summon the city', () => {
    // The bug this guards: `hold` used to be stamped on anything the cone
    // touched, liftable or not, and never lapsed while the beam was on. Fly
    // around with the beam open - which is the whole game - and every tree,
    // pylon and shelter the cone had grazed over the entire run stayed flagged
    // as caught, from any distance. Strength only ever climbs, so the moment
    // growth raised the band they all became liftable at once and came sailing
    // in from off-screen, the spring pulling harder the further away they
    // stood.
    const pylon = makeCar('pylon', 0, 0.65, 0)
    pylon.mass = 7

    const weak = field()
    weak.gripStrength = 5
    expect(beamLiftScale(pylon.mass, 5)).toBe(0)
    stepBeamObjects([pylon], weak, 1 / 60)
    // Still lit by the cone that is physically on it - that is what the player
    // sees - but not gripped.
    expect(pylon.inBeam).toBe(true)
    expect(pylon.hold ?? 0).toBe(0)

    // Flown away from, beam still on: the graze leaves nothing behind.
    const passed = field()
    passed.gripStrength = 5
    passed.position.x = 120
    stepBeamObjects([pylon], passed, 1 / 60)
    expect(pylon.inBeam).toBe(false)

    // Now the craft grows a rung, 120m away and facing nothing. The pylon must
    // stay exactly where the city put it rather than be reeled in from there.
    const grown = field()
    grown.gripStrength = 7
    grown.position.x = 120
    expect(beamLiftScale(pylon.mass, 7)).toBeGreaterThan(0)
    for (let frame = 0; frame < 120; frame += 1) stepBeamObjects([pylon], grown, 1 / 60)
    expect(pylon.inBeam).toBe(false)
    expect(pylon.tether).toBe(0)
    expect(pylon.position.x).toBe(0)
    expect(pylon.position.y).toBeCloseTo(0.65)

    // Flying over it again with the stronger beam is how it gets caught - the
    // rung opened the object up, the pass is still what picks it up.
    const sweep = field()
    sweep.gripStrength = 7
    for (let frame = 0; frame < 60; frame += 1) stepBeamObjects([pylon], sweep, 1 / 60)
    expect(pylon.inBeam).toBe(true)
    expect(pylon.position.y).toBeGreaterThan(0.65)
  })

  it('keeps hold of what it caught until the beam is cut', () => {
    // It used to let go the moment an object left the cone, which made the
    // beam a geometric test rather than a tractor beam. At cruising speed a
    // body is inside the cone for about a third of a second while the haul
    // takes a couple, so dropping on exit meant nothing could be picked up
    // while flying - only while hovering, which is not this game.
    const car = makeCar('escape', 0, 4, 0)
    stepBeamObjects([car], field(true), 1 / 60)
    expect(car.inBeam).toBe(true)

    // Flown past: out of the cone, still held.
    const swungAway = field(true)
    swungAway.position.x = 50
    stepBeamObjects([car], swungAway, 1 / 60)
    expect(car.inBeam).toBe(true)

    // Beam off: released, and it ends up back on the street. Asserted on where
    // it finished rather than on its velocity, because it bounces on landing -
    // and run long enough for the bounce to settle rather than sampling a
    // metre and a half into it, which made the assertion a reading of how high
    // the car happened to be when the beam cut rather than of it coming down.
    const cut = field(true)
    cut.position.x = 50
    cut.active = false
    for (let tick = 0; tick < 120; tick += 1) stepBeamObjects([car], cut, 1 / 60)
    expect(car.inBeam).toBe(false)
    expect(car.position.y).toBeLessThan(0.7)
  })

  it('applies gravity when the beam is off', () => {
    const car = makeCar('falling', 0, 5, 0)
    const inactive = field()
    inactive.active = false
    stepBeamObjects([car], inactive, 1 / 30)
    expect(isInsideBeam(car, inactive)).toBe(false)
    expect(car.position.y).toBeLessThan(5)
    expect(car.velocity.y).toBeLessThan(0)
  })

  it('has a non-zero steep grip gradient from the cone floor to the UFO', () => {
    const profile = beamProfile(false)
    expect(beamGrip(0, profile.maxDrop)).toBe(1)
    expect(beamGrip(profile.maxDrop, profile.maxDrop)).toBe(BEAM_MIN_GRIP)
    expect(beamGrip(profile.maxDrop * 0.85, profile.maxDrop)).toBeLessThan(0.12)
    expect(beamGrip(profile.maxDrop * 0.25, profile.maxDrop)).toBeGreaterThan(0.5)
  })

  it('makes a high heavy car resist while the same car grips strongly on a low approach', () => {
    const far = makeCar('same-heavy')
    const near = makeCar('same-heavy')
    far.mass = near.mass = 2.4
    const highField = field(false)
    highField.position.y = beamProfile(false).maxDrop + 0.65
    const lowField = field(false)
    lowField.position.y = 4
    for (let frame = 0; frame < 30; frame += 1) {
      stepBeamObjects([far], highField, 1 / 60)
      stepBeamObjects([near], lowField, 1 / 60)
    }
    expect(far.position.y).toBeGreaterThan(0.65)
    expect(near.position.y - 0.65).toBeGreaterThan((far.position.y - 0.65) * 2)
  })

  it('separates only cars that the player has touched', () => {
    const untouchedLeft = makeCar('untouched-left', 0)
    const untouchedRight = makeCar('untouched-right', 0.2)
    const inactive = field()
    inactive.active = false
    stepBeamObjects([untouchedLeft, untouchedRight], inactive, 1 / 60)
    expect(Math.abs(untouchedRight.position.x - untouchedLeft.position.x)).toBeCloseTo(0.2)

    const touchedLeft = makeCar('touched-left', 0)
    const touchedRight = makeCar('touched-right', 0.2)
    touchedLeft.playerTouched = true
    touchedRight.playerTouched = true
    stepBeamObjects([touchedLeft, touchedRight], inactive, 1 / 60)
    expect(Math.abs(touchedRight.position.x - touchedLeft.position.x)).toBeGreaterThan(2)
  })

  it('only starts absorption after the UFO one-third diameter gate is met', () => {
    const car = makeCar('size-gated', 0, 6.2, 0)
    car.inBeam = true
    car.diameter = 2.9
    expect(beginNearbyBeamObjectAbsorption([car], { x: 0, y: 7, z: 0 }, 2.8, 3)).toBeNull()
    expect(beginNearbyBeamObjectAbsorption([car], { x: 0, y: 7, z: 0 }, 2.9, 3)).toBe(car)
    expect(car.absorbing).toBe(true)
  })

  it('leaves anything the beam is too weak to lift where it stands', () => {
    // The reported bug: a beam that could not shift a bus shelter by a
    // millimetre still made one vanish the moment the craft skimmed past it,
    // because absorption asked only "in the cone, close enough" and never
    // asked the weight question the lifting ladder is built on.
    const shelter = (): BeamObject => {
      const object = makeCar('bus-stop:1', 0, 0, 0)
      object.kind = 'bus-stop'
      object.mass = 5
      object.diameter = 7.2
      object.inBeam = true
      object.freePhysics = false
      object.worldProp = {
        id: 'bus-stop:1',
        kind: 'bus-stop',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        scale: { x: 1, y: 1, z: 1 },
        variant: 0,
      }
      return object
    }

    // The craft the player actually flies: beam on, skimming the pavement the
    // shelter stands on, one frame of the cone playing over it.
    const skim = (strength: number) => {
      const object = shelter()
      const beam: BeamField = {
        active: true,
        boosting: false,
        position: { x: 0, y: 2.6, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        gripStrength: strength,
      }
      stepBeamObjects([object], beam, 1 / 60)
      expect(object.inBeam).toBe(true)
      const eaten = beginNearbyBeamObjectAbsorption([object], beam.position, Number.POSITIVE_INFINITY, 3.48, strength)
      return { object, eaten }
    }

    const weak = skim(2)
    expect(beamLiftScale(5, 2)).toBe(0)
    expect(weak.eaten).toBeNull()
    expect(weak.object.absorbing).toBe(false)
    // Still standing exactly where the city put it, so the static pool keeps
    // drawing it (see isWorldPropDisplaced).
    expect(weak.object.position).toEqual({ x: 0, y: 0, z: 0 })

    // A beam that can actually haul the shelter still eats it.
    const strong = skim(5)
    expect(strong.eaten).toBe(strong.object)
    expect(strong.object.absorbing).toBe(true)

    // Loose objects run on the same ladder. A car has no spot in the city to
    // be taken off, but a beam two rungs under its weight still cannot raise
    // it, so skimming one is not a meal either.
    const loose = () => {
      const object = makeCar('loose', 0, 2.4, 0)
      object.mass = 5
      object.inBeam = true
      return object
    }
    const weakCar = loose()
    expect(beginNearbyBeamObjectAbsorption([weakCar], { x: 0, y: 2.6, z: 0 }, Number.POSITIVE_INFINITY, 3.48, 2)).toBeNull()
    expect(weakCar.absorbing).toBe(false)
    const strongCar = loose()
    expect(beginNearbyBeamObjectAbsorption([strongCar], { x: 0, y: 2.6, z: 0 }, Number.POSITIVE_INFINITY, 3.48, 5)).toBe(strongCar)
  })

  it('refuses a car the opening craft cannot budge and takes it once grown', () => {
    // The player-facing case: the starting saucer pulls with one and a car
    // weighs three, so the beam cannot raise it off the tarmac - it must not
    // swallow it whole on contact either. Growth is what unlocks it.
    const skim = (strength: number) => {
      const car = makeCar('street-car', 0, 0.65, 0)
      car.mass = CAR_MASS
      car.inBeam = true
      const eaten = beginNearbyBeamObjectAbsorption([car], { x: 0, y: 2.6, z: 0 }, Number.POSITIVE_INFINITY, 3.48, strength)
      return { car, eaten }
    }

    const opening = sizeProfile(SIZE_START)
    expect(opening.beamStrength).toBe(1)
    expect(beamLiftScale(CAR_MASS, opening.beamStrength)).toBe(0)
    const refused = skim(opening.beamStrength)
    expect(refused.eaten).toBeNull()
    expect(refused.car.absorbing).toBe(false)
    expect(refused.car.active).toBe(true)

    // One rung of growth puts the car in the marginal band, and marginal is
    // liftable - so it becomes food.
    expect(beamLiftScale(CAR_MASS, 2)).toBeGreaterThan(0)
    const taken = skim(2)
    expect(taken.eaten).toBe(taken.car)
    expect(taken.car.absorbing).toBe(true)

    // Crowds are deliberately under the opening band: a cat and a pedestrian
    // are still meals for the craft the run starts on.
    for (const [kind, mass] of [['cat', CAT_MASS], ['pedestrian', PEDESTRIAN_MASS]] as const) {
      expect(beamLiftScale(mass, opening.beamStrength), kind).toBeGreaterThan(0)
    }
  })

  it('refuses to swallow anything wider than the hull, however strong the beam', () => {
    // The swallow gate and the pull gate are different questions, so the test
    // drives them independently: a beam strong enough to drag a station mouth
    // around does not thereby make a craft that can fit one through itself.
    // Size currently feeds both, so no live craft reaches this combination -
    // that is the point of pinning it here rather than in a balance test.
    const prop = (kind: BeamObject['kind'], diameter: number, mass: number): BeamObject => {
      const object = makeCar(`${kind}:1`, 0, 2.4, 0)
      object.kind = kind
      object.diameter = diameter
      object.mass = mass
      object.inBeam = true
      return object
    }
    const swallow = (object: BeamObject, size: number, strength: number) =>
      beginNearbyBeamObjectAbsorption([object], { x: 0, y: 2.6, z: 0 }, ufoDiameter(size), 3.48, strength)

    // The opening saucer is 2.48m across. Hand it enough strength to put a
    // 7.2m shelter and an 8.6m station mouth well inside the weight band...
    const hull = ufoDiameter(SIZE_START)
    expect(hull).toBeCloseTo(2.484)
    const strong = sizeProfile(SIZE_START).beamStrength + 5
    for (const [kind, diameter, mass] of [['bus-stop', 7.2, 5], ['subway', 8.6, 7]] as const) {
      expect(beamLiftScale(mass, strong), kind).toBeGreaterThan(0)
      // ...and the hull still refuses them.
      const object = prop(kind, diameter, mass)
      expect(swallow(object, SIZE_START, strong), kind).toBeNull()
      expect(object.absorbing, kind).toBe(false)
    }

    // Grown wide enough to fit one, the same craft eats it.
    const roomy = 8.6 / UFO_BASE_DIAMETER
    expect(ufoDiameter(roomy)).toBeCloseTo(8.6)
    const station = prop('subway', 8.6, 7)
    expect(swallow(station, roomy, strong)).toBe(station)
    expect(station.absorbing).toBe(true)
  })

  it('keeps the hull gate independent of the weight ladder in both directions', () => {
    const object = (diameter: number, mass: number): BeamObject => {
      const built = makeCar('gated', 0, 2.4, 0)
      built.diameter = diameter
      built.mass = mass
      built.inBeam = true
      return built
    }
    const swallow = (built: BeamObject, size: number, strength: number) =>
      beginNearbyBeamObjectAbsorption([built], { x: 0, y: 2.6, z: 0 }, ufoDiameter(size), 3.48, strength)

    // Wide enough but too heavy: refused by weight.
    expect(swallow(object(1, 7), 4, 1)).toBeNull()
    // Light enough but too wide: refused by bulk.
    expect(swallow(object(40, 1), 4, 7)).toBeNull()
    // Both satisfied: eaten.
    const fits = object(1, 1)
    expect(swallow(fits, 4, 7)).toBe(fits)
  })

  it('awards more base score for a larger absorbed object', () => {
    const person = makeCar('person')
    person.kind = 'pedestrian'
    person.mass = 0.28
    person.diameter = 0.78
    const tanker = makeCar('tanker')
    tanker.kind = 'explosive'
    tanker.mass = 6.2
    tanker.diameter = 5.1
    expect(absorptionScore(tanker)).toBeGreaterThan(absorptionScore(person) * 4)
  })
})

describe('integer lifting ladder', () => {
  it('exposes the four exact weight bands', () => {
    const strength = 5
    expect(beamLiftBand(3, strength)).toBe('fast')
    expect(beamLiftBand(4, strength)).toBe('strained')
    expect(beamLiftBand(5, strength)).toBe('strained')
    expect(beamLiftBand(6, strength)).toBe('marginal')
    expect(beamLiftBand(7, strength)).toBe('blocked')
    expect(beamLiftScale(3, strength)).toBeGreaterThan(beamLiftScale(4, strength))
    expect(beamLiftScale(4, strength)).toBeGreaterThan(beamLiftScale(6, strength))
    expect(beamLiftScale(7, strength)).toBe(0)
  })

  it('never moves a load two points above strength', () => {
    const object = makeCar('blocked')
    object.mass = 7
    const beam = field()
    beam.gripStrength = 5
    for (let frame = 0; frame < 120; frame += 1) stepBeamObjects([object], beam, 1 / 60)
    expect(object.position.y).toBeCloseTo(0.65)
    expect(object.tether).toBe(0)
  })

  it('makes each liftable band visibly slower than the previous one', () => {
    const objects = [makeCar('fast'), makeCar('strained'), makeCar('marginal')]
    objects[0]!.mass = 3
    objects[1]!.mass = 5
    objects[2]!.mass = 6
    const beam = field()
    beam.gripStrength = 5
    for (let frame = 0; frame < 120; frame += 1) stepBeamObjects(objects, beam, 1 / 60)
    expect(objects[0]!.position.y).toBeGreaterThan(objects[1]!.position.y)
    expect(objects[1]!.position.y).toBeGreaterThan(objects[2]!.position.y)
  })

  it('caps fast-band speed even when grip strength is far above the load', () => {
    expect(beamLiftScale(1, 3)).toBe(beamLiftScale(1, 13))
    expect(beamLiftBand(1, 3)).toBe('fast')
    expect(beamLiftBand(1, 13)).toBe('fast')
  })

  it('leaves a readable haul window instead of instant-eating heavy loads', () => {
    for (const size of [SIZE_MIN, 1, 2, 4, 8, SIZE_MATURE]) {
      const profile = sizeProfile(size)
      for (const mass of [1, 2, 3, 4, 5, 6, 7, 8, 11]) {
        const object = makeCar(`lift-${size}-${mass}`)
        object.mass = mass
        const beam = field()
        // The swallow window grows with the hull now, so the craft hovers a
        // real haul's distance above it - a grown saucer cannot physically sit
        // six metres over the street anyway; its own hull is wider than that.
        // The guarded property is unchanged: a load caught OUTSIDE the window
        // must ride the beam for a readable moment before it can be eaten.
        beam.position.y = profile.absorbDistance + 8.65
        beam.gripStrength = profile.beamStrength
        beam.radiusScale = profile.beamScale
        beam.reachScale = profile.beamReach
        beam.gripScale = profile.beamPull
        let caught = false
        let absorbSeconds = Number.POSITIVE_INFINITY
        for (let tick = 0; tick < 60 * 20; tick += 1) {
          stepBeamObjects([object], beam, 1 / 60)
          caught ||= object.inBeam
          if (caught && Math.hypot(object.position.x - beam.position.x, object.position.y - beam.position.y, object.position.z - beam.position.z) <= profile.absorbDistance) {
            absorbSeconds = tick / 60
            break
          }
        }
        // The window guards HEAVY loads, per the test's name: a giant maw
        // snapping up a mass-1 bin in a blink is the fantasy working, but a
        // car or a mast still has to visibly ride the beam.
        if (Number.isFinite(absorbSeconds) && mass >= 3) expect(absorbSeconds).toBeGreaterThan(0.05)
      }
    }
  })
})

describe('trash bins answer the laser', () => {
  const makeBin = (id = 'trash-bin:0:0:0'): BeamObject => ({
    ...makeCar(id),
    kind: 'trash-bin',
    mass: 2,
  })

  it('launches a hit bin flying and tumbling, with no explosion queued', () => {
    const bin = makeBin()
    expect(beginTrashBinLaunch(bin, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(true)
    expect(bin.destroying).toBe(true)
    // Litter, not ordnance: the launch must never queue a fireball.
    expect(bin.explosionPending).toBe(false)
    expect(bin.velocity.x).toBeGreaterThan(0)
    expect(bin.velocity.y).toBeGreaterThan(0)
    expect(Math.hypot(bin.angularVelocity.x, bin.angularVelocity.y, bin.angularVelocity.z)).toBeGreaterThan(5)
    // A bin already in flight cannot be launched twice.
    expect(beginTrashBinLaunch(bin, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(false)
  })

  it('refuses everything that is not a bin', () => {
    expect(beginTrashBinLaunch(makeCar('car-1'), { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(false)
  })

  it('flies, falls and expires on the destruction path without exploding', () => {
    const bin = makeBin()
    beginTrashBinLaunch(bin, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })
    const idle: BeamField = { active: false, boosting: false, position: { x: 0, y: 6, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }
    for (let frame = 0; frame < 70; frame += 1) stepBeamObjects([bin], idle, 1 / 60)
    expect(bin.active).toBe(false)
    expect(bin.explosionPending).toBe(false)
  })
})

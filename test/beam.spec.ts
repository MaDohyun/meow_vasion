import { HAZARD_MASS } from '../src/core/hazards'
import { CAT_MASS, PEDESTRIAN_MASS } from '../src/core/crowds'
import { describe, expect, it } from 'vitest'
import {
  BEAM_MIN_GRIP,
  type BeamField,
  type BeamObject,
  CAR_MASS,
  absorptionScore,
  beamGrip,
  beamProfile,
  beamVisualLength,
  beginNearbyBeamObjectAbsorption,
  isInsideBeam,
  stepBeamObjects,
} from '../src/core/beam'
import { SIZE_MAX, SIZE_MIN, sizeProfile } from '../src/core/size'

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

  it('widens the beam with the craft but does not lengthen it', () => {
    // Growing widens the cone because the hull is wider - that is the body
    // getting bigger, not a reward. Reach used to grow too, which paid twice
    // for the same thing and let a late-run craft hoover a street from outside
    // every threat band. Length is bought with a card now, not with size.
    const small = sizeProfile(SIZE_MIN)
    const large = sizeProfile(SIZE_MAX)
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
    expect(light.position.y).toBeGreaterThan(heavy.position.y + 0.6)
    expect(heavy.position.y).toBeGreaterThan(0.7)
  })

  it('drops an object as soon as it leaves the cone', () => {
    const car = makeCar('escape', 0, 4, 0)
    stepBeamObjects([car], field(true), 1 / 60)
    expect(car.inBeam).toBe(true)
    const previousVerticalVelocity = car.velocity.y
    const missedField = field(true)
    missedField.position.x = 50
    stepBeamObjects([car], missedField, 1 / 60)
    expect(car.inBeam).toBe(false)
    expect(car.velocity.y).toBeLessThan(previousVerticalVelocity)
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

describe('how long a load rides the beam', () => {
  function held(mass: number): BeamObject {
    return {
      id: 'load', kind: 'car', mass, color: '#fff',
      position: { x: 0, y: 0.65, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 },
      active: true, inBeam: false, tether: 0, playerTouched: false,
      destroying: false, destroyTimer: 0, explosionPending: false,
      absorbing: false, absorbTimer: 0,
    }
  }

  /**
   * Seconds to haul a street-level object eight metres up.
   *
   * Distance covered rather than distance-to-craft: an object settles into an
   * orbit slot chosen by hashing its id, so "how close did it get" varies by a
   * few metres per object and would make this measure depend on a name.
   */
  const RISE_TARGET = 5
  function riseSeconds(mass: number, craftY = 14, gripScale = 1) {
    const object = held(mass)
    const start = object.position.y
    const field: BeamField = {
      active: true, boosting: false,
      position: { x: 0, y: craftY, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      gripScale,
    }
    for (let tick = 0; tick < 6000; tick += 1) {
      stepBeamObjects([object], field, 1 / 60, false)
      if (object.position.y - start >= RISE_TARGET) return tick / 60
    }
    return Infinity
  }

  it('keeps a car hanging long enough for its weight to be felt', () => {
    // Beam ballast is the only speed penalty in the game, and it used to be
    // charged for about a second because a car was swallowed almost as soon as
    // it was caught. The penalty has to be something you fly under, not
    // something that happens to you. Five metres of climb is the measure; the
    // full haul from street to craft runs about twice this.
    const car = riseSeconds(CAR_MASS)
    expect(car).toBeGreaterThan(2)
    expect(car).toBeLessThan(6)
  })

  it('brings living bodies up quickly and dead weight up slowly', () => {
    // The gap is the lesson: sweeping up people is the loop, hauling a car is
    // a mistake you can feel. Both got heavier, the car far more so.
    const cat = riseSeconds(CAT_MASS)
    const pedestrian = riseSeconds(PEDESTRIAN_MASS)
    const car = riseSeconds(CAR_MASS)
    const tanker = riseSeconds(HAZARD_MASS)
    expect(cat).toBeLessThan(pedestrian)
    expect(pedestrian).toBeLessThan(1)
    expect(car).toBeGreaterThan(pedestrian * 8)
    expect(tanker).toBeGreaterThan(car)
  })

  it('lets the grip upgrade buy that time back', () => {
    // Which is what makes it worth a card: the upgrade is the answer to the
    // penalty rather than a flat bonus.
    expect(riseSeconds(CAR_MASS, 14, 1.8)).toBeLessThan(riseSeconds(CAR_MASS, 14) / 2)
  })

  it('costs more the higher the craft hovers', () => {
    // Grip falls off with drop, so hauling from altitude is the expensive way
    // to do it. Hovering low is the skill the beam rewards.
    expect(riseSeconds(CAR_MASS, 20)).toBeGreaterThan(riseSeconds(CAR_MASS, 10))
  })
})

import { describe, expect, it } from 'vitest'
import { BEAM_MIN_GRIP, beamGrip, beamProfile, beamVisualLength, isInsideBeam, stepBeamObjects, type BeamField, type BeamObject } from '../src/core/beam'

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

  it('supports upgrade radius scaling without extending beam drop', () => {
    expect(beamProfile(false, 1.5).baseRadius).toBeCloseTo(beamProfile(false).baseRadius * 1.5)
    expect(beamProfile(false, 1.5).coneSpread).toBeCloseTo(beamProfile(false).coneSpread * 1.5)
    expect(beamProfile(false, 1.5).maxDrop).toBe(36)
    expect(beamProfile(true).maxDrop).toBe(56)
  })

  it('keeps visual length tied to ground and range rather than a lifted target', () => {
    expect(beamVisualLength(12, beamProfile(false).maxDrop)).toBeCloseTo(11.85)
    expect(beamVisualLength(80, beamProfile(false).maxDrop)).toBe(beamProfile(false).maxDrop)
    expect(beamVisualLength(80, beamProfile(true).maxDrop)).toBe(beamProfile(true).maxDrop)
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
})

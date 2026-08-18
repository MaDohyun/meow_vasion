import { describe, expect, it } from 'vitest'
import { beamProfile, isInsideBeam, stepBeamObjects, type BeamField, type BeamObject } from '../src/core/beam'

const makeCar = (id = 'car-1', x = 0, y = 0.65, z = 0): BeamObject => ({
  id,
  kind: 'car',
  mass: 2.4,
  color: '#ff5d74',
  position: { x, y, z },
  velocity: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  angularVelocity: { x: 0, y: 0, z: 0 },
  inBeam: false,
  tether: 0,
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
    for (let frame = 0; frame < 12; frame += 1) stepBeamObjects(cars, field(), 1 / 60)
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
    expect(beamProfile(false, 1.5).maxDrop).toBe(15)
    expect(beamProfile(true).maxDrop).toBe(24)
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
})

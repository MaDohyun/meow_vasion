import { describe, expect, it } from 'vitest'
import { beamProfile, isInsideBeam, type BeamField, type BeamObject } from '../src/core/beam'
import { createDroneState, stepDrone, type DroneInput } from '../src/core/drone'
import { sizeProfile, SIZE_MAX, SIZE_START } from '../src/core/size'

const UPGRADES = { speed: 0.45, stability: 0, rack: 0, special: 'none' as const }
const INPUT: DroneInput = { throttle: 1, steer: 0, strafe: 0, lookPitch: 0, vertical: 0, special: false }

function cruiseSpeed(load: number, seconds = 12) {
  let state = createDroneState()
  for (let frame = 0; frame < seconds * 60; frame += 1) {
    state = stepDrone(state, INPUT, 1 / 60, load, UPGRADES)
  }
  return state.speed
}

function objectAt(x: number, z: number): Pick<BeamObject, 'position'> {
  return { position: { x, y: 0.65, z } }
}

describe('beam ballast is where the speed penalty lives', () => {
  it('slows the craft in proportion to hanging mass', () => {
    const clean = cruiseSpeed(0)
    const oneCar = cruiseSpeed(2.4 * 0.85)
    const threeCars = cruiseSpeed(3 * 2.4 * 0.85)
    expect(oneCar).toBeLessThan(clean)
    expect(threeCars).toBeLessThan(oneCar)
    // A single car has to be felt straight away or there is no reason to dump.
    expect(oneCar).toBeLessThan(clean * 0.9)
  })

  it('prices a heavy object above a light one', () => {
    const car = cruiseSpeed(2.4 * 0.85)
    const extinguisher = cruiseSpeed(0.5 * 0.85)
    expect(car).toBeLessThan(extinguisher)
  })

  it('returns full speed once the load is dumped', () => {
    const clean = cruiseSpeed(0)
    let state = createDroneState()
    for (let frame = 0; frame < 8 * 60; frame += 1) state = stepDrone(state, INPUT, 1 / 60, 3 * 2.4 * 0.85, UPGRADES)
    const loaded = state.speed
    for (let frame = 0; frame < 8 * 60; frame += 1) state = stepDrone(state, INPUT, 1 / 60, 0, UPGRADES)
    expect(loaded).toBeLessThan(clean * 0.75)
    expect(state.speed).toBeGreaterThan(clean * 0.98)
  })

  it('makes a grown craft foul its beam more easily', () => {
    // This is the actual cost of growing: the wider cone sweeps up people
    // faster, and sweeps up cars faster too.
    const ufo = { x: 0, y: 6, z: 0 }
    const field = (size: number): BeamField => ({
      active: true, boosting: false, position: ufo,
      velocity: { x: 0, y: 0, z: 0 }, radiusScale: sizeProfile(size).beamScale,
    })
    const junk = objectAt(7.4, 0)
    expect(isInsideBeam(junk, field(SIZE_START))).toBe(false)
    expect(isInsideBeam(junk, field(SIZE_MAX))).toBe(true)
    expect(beamProfile(false, sizeProfile(SIZE_MAX).beamScale).baseRadius)
      .toBeGreaterThan(beamProfile(false, sizeProfile(SIZE_START).beamScale).baseRadius)
  })
})

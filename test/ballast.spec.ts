import { describe, expect, it } from 'vitest'
import { beamLiftScale, beamProfile, isInsideBeam, stepBeamObjects, type BeamField, type BeamObject } from '../src/core/beam'
import { WORLD_PROP_MASS } from '../src/core/worldProps'
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

  it('charges nothing for a load the beam cannot move at all', () => {
    // The rule: weight the beam cannot shift is not carried, so it must not be
    // billed either. Ballast and the HUD load count both read `tether > 0.02`
    // (see beamBallast and loadedCarCount in GameContext), and tether only
    // grows inside the lifting branch - so this pins the property at the
    // source rather than at the two places that sum it.
    const mast = (mass: number): BeamObject => ({
      id: `mast:${mass}`,
      kind: 'power-pylon',
      mass,
      color: '#59616a',
      position: { x: 0, y: 0, z: 0 },
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
      freePhysics: false,
      worldProp: {
        id: `mast:${mass}`,
        kind: 'power-pylon',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        scale: { x: 1, y: 1, z: 1 },
        variant: 0,
      },
    })
    const hover = (object: BeamObject, gripStrength: number) => {
      const beam: BeamField = {
        active: true,
        boosting: false,
        position: { x: 0, y: 6, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        gripStrength,
      }
      for (let frame = 0; frame < 180; frame += 1) stepBeamObjects([object], beam, 1 / 60)
      return object
    }

    // Three seconds of beam on a pylon two rungs above the craft's strength.
    const blocked = hover(mast(WORLD_PROP_MASS['power-pylon']), 3)
    expect(beamLiftScale(blocked.mass, 3)).toBe(0)
    // Caught by the cone - the beam is playing over it, which is what the
    // player sees - but not moved, and so not weighed.
    expect(blocked.inBeam).toBe(true)
    expect(blocked.tether).toBe(0)
    expect(blocked.position.y).toBe(0)

    // One rung up, the same pylon is a real load and is charged for.
    const carried = hover(mast(WORLD_PROP_MASS['power-pylon']), 5)
    expect(carried.tether).toBeGreaterThan(0.02)
    expect(carried.position.y).toBeGreaterThan(1)
  })

  it('keeps beam radius independent of craft growth', () => {
    // This is the actual cost of growing: the wider cone sweeps up people
    // faster, and sweeps up cars faster too.
    const ufo = { x: 0, y: 6, z: 0 }
    const field = (size: number): BeamField => ({
      active: true, boosting: false, position: ufo,
      velocity: { x: 0, y: 0, z: 0 }, radiusScale: sizeProfile(size).beamScale,
    })
    const junk = objectAt(7.4, 0)
    expect(isInsideBeam(junk, field(SIZE_START))).toBe(false)
    expect(isInsideBeam(junk, field(SIZE_MAX))).toBe(false)
    expect(beamProfile(false, sizeProfile(SIZE_MAX).beamScale).baseRadius)
      .toBe(beamProfile(false, sizeProfile(SIZE_START).beamScale).baseRadius)
  })
})

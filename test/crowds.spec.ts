import { describe, expect, it } from 'vitest'
import { beginCarDestruction, stepBeamObjects, type BeamObject } from '../src/core/beam'
import {
  CAT_MAX,
  CROWD_ABSORB_TIME,
  INITIAL_CATS,
  INITIAL_PEDESTRIANS,
  PEDESTRIAN_MAX,
  activeCrowdCount,
  beginNearbyCrowdAbsorption,
  createCrowdState,
  stepCrowds,
} from '../src/core/crowds'

const inactiveBeam = {
  active: false,
  boosting: false,
  position: { x: 0, y: 3, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
}

function car(): BeamObject {
  return {
    id: 'car:test', kind: 'car', mass: 2.4, color: '#fff',
    position: { x: 0, y: 0.65, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 },
    active: true, inBeam: false, tether: 0, playerTouched: false,
    destroying: false, destroyTimer: 0, explosionPending: false,
    absorbing: false, absorbTimer: 0,
  }
}

describe('pooled city crowds and destructible cars', () => {
  it('keeps fixed pedestrian and rare-cat pools and spawns behind view', () => {
    const state = createCrowdState(42)
    expect(state.objects).toHaveLength(PEDESTRIAN_MAX + CAT_MAX)
    const view = { position: { x: 0, y: 3, z: 0 }, heading: 0 }
    stepCrowds(state, view, 0)
    expect(activeCrowdCount(state, 'pedestrian')).toBe(INITIAL_PEDESTRIANS)
    expect(activeCrowdCount(state, 'cat')).toBe(INITIAL_CATS)
    for (let frame = 0; frame < 420; frame += 1) {
      stepCrowds(state, view, 0.05)
      stepBeamObjects(state.objects, inactiveBeam, 0.05)
    }
    expect(activeCrowdCount(state, 'pedestrian')).toBeGreaterThan(activeCrowdCount(state, 'cat'))
    expect(activeCrowdCount(state, 'cat')).toBeGreaterThan(0)
    expect(state.objects.filter((object) => object.active).every((object) => object.position.z < 80)).toBe(true)
  })

  it('makes pedestrians flee a low approaching UFO and caches nearby density', () => {
    const state = createCrowdState(7)
    const pedestrian = state.objects.find((object) => object.kind === 'pedestrian')!
    pedestrian.active = true
    pedestrian.position = { x: 2, y: 0.65, z: 0 }
    pedestrian.velocity = { x: 0, y: 0, z: 0 }
    stepCrowds(state, { position: { x: 0, y: 3, z: 0 }, heading: 0 }, 1 / 60)
    expect(pedestrian.velocity.x).toBeGreaterThan(7)
    expect(state.nearbyPedestrians).toBe(1)
  })

  it('gives cats and pedestrians much less beam mass than cars', () => {
    const state = createCrowdState()
    const pedestrian = state.objects.find((object) => object.kind === 'pedestrian')!
    const cat = state.objects.find((object) => object.kind === 'cat')!
    expect(pedestrian.mass).toBeLessThan(0.5)
    expect(cat.mass).toBeLessThan(pedestrian.mass)
    expect(cat.mass).toBeLessThan(car().mass / 10)
  })

  it('shrinks a beamed crowd member only after reaching the UFO', () => {
    const state = createCrowdState(9)
    const pedestrian = state.objects.find((object) => object.kind === 'pedestrian')!
    pedestrian.active = true
    pedestrian.inBeam = true
    pedestrian.position = { x: 0.4, y: 3.2, z: 0.2 }
    expect(beginNearbyCrowdAbsorption(state, { x: 0, y: 4, z: 0 })?.id).toBe(pedestrian.id)
    expect(pedestrian.absorbing).toBe(true)
    stepCrowds(state, { position: { x: 0, y: 4, z: 0 }, heading: 0 }, CROWD_ABSORB_TIME / 2)
    expect(pedestrian.active).toBe(true)
    stepCrowds(state, { position: { x: 0, y: 4, z: 0 }, heading: 0 }, CROWD_ABSORB_TIME)
    for (let frame = 0; frame < 6; frame += 1) stepCrowds(state, { position: { x: 0, y: 4, z: 0 }, heading: 0 }, 0.05)
    expect(pedestrian.active).toBe(false)
  })

  it('launches and spins a one-hit car before pooled removal', () => {
    const object = car()
    expect(beginCarDestruction(object, { x: 1, y: 0, z: 0 }, { x: 4, y: 0, z: 0 })).toBe(true)
    expect(object.active).toBe(true)
    expect(object.velocity.x).toBeGreaterThan(31)
    expect(Math.abs(object.angularVelocity.y)).toBeGreaterThan(10)
    for (let frame = 0; frame < 12; frame += 1) stepBeamObjects([object], inactiveBeam, 0.05)
    expect(object.active).toBe(false)
    expect(object.position.x).toBeGreaterThan(10)
    expect(object.explosionPending).toBe(true)
  })
})

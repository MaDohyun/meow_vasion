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
  it('keeps fixed pools and scatters the run-start seed all around the player', () => {
    const state = createCrowdState(42)
    expect(state.objects).toHaveLength(PEDESTRIAN_MAX + CAT_MAX)
    const view = { position: { x: 0, y: 3, z: 0 }, heading: 0 }
    stepCrowds(state, view, 0)
    expect(activeCrowdCount(state, 'pedestrian')).toBe(INITIAL_PEDESTRIANS)
    expect(activeCrowdCount(state, 'cat')).toBe(INITIAL_CATS)
    const seeded = state.objects.filter((object) => object.active)
    // The seed used to land entirely in a cone behind the view, which read as a
    // crowd stuck to the player's back. Every quadrant should be occupied now.
    const quadrants = new Set(seeded.map((object) => `${object.position.x >= 0}:${object.position.z >= 0}`))
    expect(quadrants.size).toBe(4)
    for (const object of seeded) {
      const distance = Math.hypot(object.position.x, object.position.z)
      expect(distance).toBeGreaterThan(12)
      expect(distance).toBeLessThan(110)
    }
    for (let frame = 0; frame < 420; frame += 1) {
      stepCrowds(state, view, 0.05)
      stepBeamObjects(state.objects, inactiveBeam, 0.05)
    }
    expect(activeCrowdCount(state, 'pedestrian')).toBeGreaterThan(activeCrowdCount(state, 'cat'))
    expect(activeCrowdCount(state, 'cat')).toBeGreaterThan(0)
  })

  it('still seeds the crowd inside a dense block of buildings', () => {
    const colliders = []
    // A tight grid of city blocks over the whole seed ring.
    for (let x = -120; x <= 120; x += 22) {
      for (let z = -120; z <= 120; z += 22) {
        colliders.push({ minX: x, maxX: x + 14, minY: 0, maxY: 20, minZ: z, maxZ: z + 14 })
      }
    }
    const state = createCrowdState(77)
    stepCrowds(state, { position: { x: 3, y: 3, z: 5 }, heading: 1.2, colliders }, 0)
    const seeded = state.objects.filter((object) => object.active)
    expect(seeded.length).toBeGreaterThanOrEqual(INITIAL_PEDESTRIANS + INITIAL_CATS - 2)
    for (const object of seeded) {
      const inside = colliders.some((collider) =>
        object.position.x > collider.minX && object.position.x < collider.maxX &&
        object.position.z > collider.minZ && object.position.z < collider.maxZ)
      expect(inside).toBe(false)
    }
  })

  it('makes pedestrians flee a low approaching UFO and caches nearby density', () => {
    const state = createCrowdState(7)
    state.initialSpawnDone = true
    state.spawnTimer = 999
    const pedestrian = state.objects.find((object) => object.kind === 'pedestrian')!
    pedestrian.active = true
    pedestrian.position = { x: 2, y: 0.65, z: 0 }
    pedestrian.velocity = { x: 0, y: 0, z: 0 }
    const view = { position: { x: 0, y: 3, z: 0 }, heading: 0 }
    // Flee speed is now blended in rather than slammed on, so it builds over a
    // few frames instead of snapping between wander and sprint every tick.
    for (let frame = 0; frame < 30; frame += 1) stepCrowds(state, view, 1 / 60)
    expect(pedestrian.velocity.x).toBeGreaterThan(6)
    expect(state.nearbyPedestrians).toBe(1)
  })

  it('holds the flee state through the hysteresis band instead of flickering', () => {
    const state = createCrowdState(11)
    state.initialSpawnDone = true
    const pedestrian = state.objects.find((object) => object.kind === 'pedestrian')!
    pedestrian.active = true
    pedestrian.position = { x: 14, y: 0.65, z: 0 }
    pedestrian.velocity = { x: 0, y: 0, z: 0 }
    const view = { position: { x: 0, y: 3, z: 0 }, heading: 0 }
    // Park the pedestrian right on the old single threshold. Under the previous
    // logic this toggled flee on and off every frame, which is what made the
    // crowd vibrate; the wider exit ring has to keep it committed.
    for (let frame = 0; frame < 4; frame += 1) stepCrowds(state, view, 1 / 60)
    expect(pedestrian.fleeTimer).toBeGreaterThan(0)
    for (let frame = 0; frame < 20; frame += 1) {
      pedestrian.position.x = 15
      pedestrian.position.z = 0
      stepCrowds(state, view, 1 / 60)
      expect(pedestrian.fleeTimer).toBeGreaterThan(0)
    }
  })

  it('keeps cats faster than people but slow enough to be caught', () => {
    const state = createCrowdState(3)
    state.initialSpawnDone = true
    const cat = state.objects.find((object) => object.kind === 'cat')!
    const pedestrian = state.objects.find((object) => object.kind === 'pedestrian')!
    for (const object of [cat, pedestrian]) {
      object.active = true
      object.position = { x: 0, y: 0.65, z: object === cat ? 6 : -6 }
      object.velocity = { x: 0, y: 0, z: 0 }
    }
    const view = { position: { x: 0, y: 3, z: 0 }, heading: 0 }
    for (let frame = 0; frame < 40; frame += 1) stepCrowds(state, view, 1 / 60)
    const catSpeed = Math.hypot(cat.velocity.x, cat.velocity.z)
    const pedestrianSpeed = Math.hypot(pedestrian.velocity.x, pedestrian.velocity.z)
    expect(catSpeed).toBeGreaterThan(pedestrianSpeed)
    expect(catSpeed).toBeLessThan(9)
  })

  it('slides a fleeing pedestrian along a wall instead of stalling on it', () => {
    const state = createCrowdState(5)
    state.initialSpawnDone = true
    const pedestrian = state.objects.find((object) => object.kind === 'pedestrian')!
    pedestrian.active = true
    pedestrian.position = { x: 0, y: 0.65, z: 8 }
    pedestrian.velocity = { x: 0, y: 0, z: 0 }
    // A long wall straight ahead of the escape direction.
    const colliders = [{ minX: -60, maxX: 60, minY: 0, maxY: 12, minZ: 11, maxZ: 13 }]
    const view = { position: { x: 0, y: 3, z: 0 }, heading: 0, colliders }
    for (let frame = 0; frame < 90; frame += 1) stepCrowds(state, view, 1 / 60)
    expect(pedestrian.position.z).toBeLessThan(11)
    // Blocked on z only, it should still be making progress along x.
    expect(Math.abs(pedestrian.position.x)).toBeGreaterThan(2)
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

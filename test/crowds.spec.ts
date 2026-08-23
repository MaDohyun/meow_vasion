import { describe, expect, it } from 'vitest'
import { type BeamObject, CAR_MASS, beginCarDestruction, stepBeamObjects } from '../src/core/beam'
import {
  CAT_MAX,
  CROWD_ABSORB_TIME,
  CROWD_CELL_ACTIVATE_RADIUS,
  crowdPositionIsWalkable,
  crowdObjectIsVisible,
  INITIAL_CATS,
  INITIAL_PEDESTRIANS,
  PEDESTRIAN_MAX,
  activeCrowdCount,
  beginNearbyCrowdAbsorption,
  createCrowdState,
  prepareTutorialCrowd,
  stepCrowds,
} from '../src/core/crowds'
import { lakeClusterForCell, WORLD_CELL_SIZE } from '../src/core/world'

const inactiveBeam = {
  active: false,
  boosting: false,
  position: { x: 0, y: 3, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
}

function car(): BeamObject {
  return {
    id: 'car:test', kind: 'car', mass: CAR_MASS, color: '#fff',
    position: { x: 0, y: 0.65, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 },
    active: true, inBeam: false, tether: 0, playerTouched: false,
    destroying: false, destroyTimer: 0, explosionPending: false,
    absorbing: false, absorbTimer: 0,
  }
}

describe('pooled city crowds and destructible cars', () => {
  it('keeps fixed pools and seeds a city-wide population at run start', () => {
    const state = createCrowdState(42)
    expect(state.objects).toHaveLength(PEDESTRIAN_MAX + CAT_MAX)
    const view = { position: { x: 0, y: 3, z: 0 }, heading: 0 }
    stepCrowds(state, view, 0)
    // The camera wedge is dressed by the opening seed, and the district layer
    // fills the rest of the activation ring on top of it.
    expect(activeCrowdCount(state, 'pedestrian')).toBeGreaterThanOrEqual(INITIAL_PEDESTRIANS)
    expect(activeCrowdCount(state, 'cat')).toBeGreaterThanOrEqual(INITIAL_CATS)
    const seeded = state.objects.filter((object) => object.active)
    // The population is city-wide now: turning around at spawn, or flying out
    // in any direction, must find residents rather than empty pavement.
    expect(seeded.some((object) => !crowdObjectIsVisible(object.position, view))).toBe(true)
    for (const object of seeded) {
      // A cell's centre gates activation, so a resident can stand up to half a
      // cell diagonal (plus placement jitter) beyond the ring itself.
      expect(Math.hypot(object.position.x, object.position.z)).toBeLessThan(CROWD_CELL_ACTIVATE_RADIUS + 40)
    }
    for (let index = 0; index < seeded.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < seeded.length; otherIndex += 1) {
        const left = seeded[index]!
        const right = seeded[otherIndex]!
        expect(Math.hypot(left.position.x - right.position.x, left.position.z - right.position.z)).toBeGreaterThanOrEqual(3.2)
      }
    }
    for (let frame = 0; frame < 420; frame += 1) {
      stepCrowds(state, view, 0.05)
      stepBeamObjects(state.objects, inactiveBeam, 0.05)
    }
    expect(activeCrowdCount(state, 'pedestrian')).toBeGreaterThan(activeCrowdCount(state, 'cat'))
    expect(activeCrowdCount(state, 'cat')).toBeGreaterThan(0)
  })

  it('repopulates a district after the player leaves and returns', () => {
    const state = createCrowdState(2024)
    const home = { position: { x: 0, y: 3, z: 0 }, heading: 0 }
    stepCrowds(state, home, 0)
    const homeCount = state.objects.filter((object) => object.active && Math.hypot(object.position.x, object.position.z) < 150).length
    expect(homeCount).toBeGreaterThan(10)
    // Fly far away: residents cull at the remove distance and the activation
    // marks are forgotten past the forget radius.
    const away = { position: { x: 2000, y: 3, z: 0 }, heading: 0 }
    for (let frame = 0; frame < 40; frame += 1) stepCrowds(state, away, 0.05)
    expect(state.objects.filter((object) => object.active && Math.hypot(object.position.x, object.position.z) < 150).length).toBe(0)
    // Coming back re-creates the district census instead of empty streets.
    for (let frame = 0; frame < 40; frame += 1) stepCrowds(state, home, 0.05)
    const backCount = state.objects.filter((object) => object.active && Math.hypot(object.position.x, object.position.z) < 150).length
    expect(backCount).toBeGreaterThan(10)
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

  it('starts the opening with moving people and one stationary tutorial cat', () => {
    const state = createCrowdState(101)
    prepareTutorialCrowd(state, { x: 0, z: 8 })
    const view = { position: { x: 0, y: 3, z: 0 }, heading: 0, tutorialCatOnly: true }
    stepCrowds(state, view, 0)
    expect(activeCrowdCount(state, 'pedestrian')).toBeGreaterThanOrEqual(INITIAL_PEDESTRIANS)
    expect(activeCrowdCount(state, 'cat')).toBe(1)
    const tutorialCat = state.objects.find((object) => object.id.startsWith('tutorial-cat'))!
    expect(tutorialCat.position).toMatchObject({ x: 0, z: 8 })
    expect(tutorialCat.pauseTimer).toBeGreaterThan(100)
  })

  it('keeps a crowd slot alive when only the camera direction changes', () => {
    const state = createCrowdState(202)
    state.initialSpawnDone = true
    state.spawnTimer = 999
    const pedestrian = state.objects.find((object) => object.kind === 'pedestrian')!
    pedestrian.active = true
    pedestrian.position = { x: 0, y: 0.65, z: 60 }
    pedestrian.velocity = { x: 0, y: 0, z: 0 }
    // This faces away from the actor. It is still close enough to remain a
    // real city resident rather than disappearing when the UFO turns around.
    stepCrowds(state, { position: { x: 0, y: 3, z: 0 }, heading: Math.PI }, 1 / 60)
    expect(pedestrian.active).toBe(true)
    pedestrian.position.z = 320
    stepCrowds(state, { position: { x: 0, y: 3, z: 0 }, heading: Math.PI }, 1 / 60)
    expect(pedestrian.active).toBe(false)
  })

  it('keeps pedestrians and cats off the lake surface', () => {
    let lake: { x: number; z: number } | null = null
    let shore: { x: number; z: number } | null = null
    for (let z = -20; z <= 20 && !shore; z += 1) {
      for (let x = -20; x <= 20; x += 1) {
        if (!lakeClusterForCell(x, z) || lakeClusterForCell(x - 1, z)) continue
        lake = { x, z }
        shore = { x: x * WORLD_CELL_SIZE - 0.08, z: (z + 0.5) * WORLD_CELL_SIZE }
        break
      }
    }
    expect(lake).not.toBeNull()
    expect(shore).not.toBeNull()
    expect(crowdPositionIsWalkable({ x: (lake!.x + 0.5) * WORLD_CELL_SIZE, z: (lake!.z + 0.5) * WORLD_CELL_SIZE })).toBe(false)
    for (const kind of ['pedestrian', 'cat'] as const) {
      const state = createCrowdState(kind === 'pedestrian' ? 88 : 89)
      state.initialSpawnDone = true
      state.spawnTimer = 999
      const object = state.objects.find((item) => item.kind === kind)!
      object.active = true
      object.position = { x: shore!.x, y: 0.65, z: shore!.z }
      object.heading = Math.PI / 2
      object.rotation.y = object.heading
      object.velocity = { x: kind === 'cat' ? 2.35 : 1.7, y: 0, z: 0 }
      object.roams = true
      object.wanderTimer = 999
      stepCrowds(state, { position: { x: shore!.x - 30, y: 3, z: shore!.z }, heading: 0 }, 1 / 30)
      expect(crowdPositionIsWalkable(object.position)).toBe(true)
      expect(object.position.x).toBeLessThan(lake!.x * WORLD_CELL_SIZE)
    }

    // A slot from a pre-boundary run may already be in the lake. It must be
    // recycled instead of being left stranded at an internal tile seam.
    const stale = createCrowdState(90)
    stale.initialSpawnDone = true
    stale.spawnTimer = 999
    const staleObject = stale.objects.find((item) => item.kind === 'pedestrian')!
    staleObject.active = true
    staleObject.position = { x: (lake!.x + 0.5) * WORLD_CELL_SIZE, y: 0.65, z: (lake!.z + 0.5) * WORLD_CELL_SIZE }
    stepCrowds(stale, { position: { x: 0, y: 3, z: 0 }, heading: 0 }, 1 / 60)
    expect(staleObject.active).toBe(false)
  })

  it('walks most pedestrians to a destination instead of pacing on the spot', () => {
    // A random walk has an expected displacement near zero, so a park seeded
    // with sixteen people keeps sixteen people no matter how long the run goes
    // and the streets around it stay empty. Errands are what spread a crowd
    // over the city without touching a single spawn weight.
    const state = createCrowdState(4242)
    const view = { position: { x: 0, y: 7, z: 0 }, heading: 0 }
    stepCrowds(state, view, 0)
    const start = new Map(state.objects.filter((object) => object.active).map((object) => [object.id, { ...object.position }]))
    for (let frame = 0; frame < 45 * 60; frame += 1) stepCrowds(state, view, 1 / 60)
    const walked: number[] = []
    const loitered: number[] = []
    for (const object of state.objects) {
      if (object.kind !== 'pedestrian') continue
      const from = start.get(object.id)
      // Recycled slots got a fresh position, so only bodies alive the whole
      // stretch say anything about how far a walk actually goes.
      if (!from || !object.active) continue
      const travelled = Math.hypot(object.position.x - from.x, object.position.z - from.z)
      if (object.roams) loitered.push(travelled)
      else walked.push(travelled)
    }
    expect(walked.length).toBeGreaterThan(loitered.length)
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
    expect(mean(walked)).toBeGreaterThan(mean(loitered) * 1.5)
    // And the errand runners really are covering blocks, not drifting a few
    // metres - a cell is 34m across.
    expect(mean(walked)).toBeGreaterThan(34)
    // Cats stroll to destinations too now - a city where every cat paces the
    // same square metre reads as furniture, not animals.
    const cats = state.objects.filter((object) => object.active && object.kind === 'cat')
    expect(cats.filter((object) => !object.roams).length).toBeGreaterThan(cats.length / 2)
  })

  it('sends pedestrians down streets rather than through the middle of blocks', () => {
    // Destinations snap to the road grid, so a walker's target sits just off a
    // carriageway. If it did not, people would file diagonally across building
    // footprints and get stuck on the first wall.
    const state = createCrowdState(9137)
    stepCrowds(state, { position: { x: 0, y: 7, z: 0 }, heading: 0 }, 0)
    for (const object of state.objects) {
      if (object.kind !== 'pedestrian' || !object.active || object.roams) continue
      const offRoadX = Math.abs(object.targetX - Math.round(object.targetX / 34) * 34)
      const offRoadZ = Math.abs(object.targetZ - Math.round(object.targetZ / 34) * 34)
      // The free axis can land near a road by chance, so the test asks only
      // that one axis is pinned to a lane, not that the other is not.
      const onLane = Math.abs(offRoadX - 3.65) < 1e-6 || Math.abs(offRoadZ - 3.65) < 1e-6
      expect(onLane).toBe(true)
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

  it('uses the integer reconnaissance weight table', () => {
    // Every mass went up so objects ride the beam long enough to be felt, but
    // inert ones went up further. The gap is the point, not the numbers: it is
    // what makes hauling the wrong thing feel different from hauling the right
    // one, so this is asserted as a ratio.
    const state = createCrowdState()
    const pedestrian = state.objects.find((object) => object.kind === 'pedestrian')!
    const cat = state.objects.find((object) => object.kind === 'cat')!
    expect(cat.mass).toBeLessThan(pedestrian.mass)
    expect(cat.mass).toBe(1)
    expect(pedestrian.mass).toBe(2)
    expect(car().mass).toBe(3)
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

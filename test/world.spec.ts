import { describe, expect, it } from 'vitest'
import {
  activeWorldColliders,
  createActiveWorld,
  getProceduralCell,
  missionBuildingAnchors,
  seedForWorldCell,
  updateActiveWorld,
  WORLD_MAX_BUILDINGS,
  WORLD_MAX_CARS,
  WORLD_CELL_SIZE,
  WORLD_GROUND_RADIUS_CELLS,
  WORLD_REMOVE_RADIUS,
  WORLD_SPAWN_RADIUS,
} from '../src/core/world'

describe('deterministic infinite city', () => {
  it('regenerates identical content for any signed cell coordinate', () => {
    const coordinates = [[0, 0], [12, -8], [-43, 91]] as const
    for (const [x, z] of coordinates) {
      expect(seedForWorldCell(x, z)).toBe(seedForWorldCell(x, z))
      expect(getProceduralCell(x, z)).toEqual(getProceduralCell(x, z))
    }
    expect(getProceduralCell(12, -8)).not.toEqual(getProceduralCell(-43, 91))
  })

  it('rebuilds the same nearby layout after leaving and returning', () => {
    const origin = { x: 1260, z: -2140 }
    const initial = createActiveWorld(origin)
    const farAway = updateActiveWorld(initial, { x: 9000, z: 9000 }, true)
    const returned = updateActiveWorld(farAway, origin, true)
    expect(returned.buildings).toEqual(initial.buildings)
    expect(returned.cars).toEqual(initial.cars)
  })

  it('keeps active object pools bounded and creates only local colliders', () => {
    const world = createActiveWorld({ x: 0, z: 0 })
    expect(world.buildings.length).toBeLessThanOrEqual(WORLD_MAX_BUILDINGS)
    expect(world.cars.length).toBeLessThanOrEqual(WORLD_MAX_CARS)
    expect(activeWorldColliders(world)).toHaveLength(world.buildings.length)
    for (const object of [...world.buildings, ...world.cars]) {
      expect(Math.hypot(object.position.x, object.position.z)).toBeLessThanOrEqual(WORLD_SPAWN_RADIUS)
    }
  })

  it('keeps the initial flight lane clear of building geometry', () => {
    const start = { x: 0, y: 2.8, z: 54.5 }
    const colliders = activeWorldColliders(createActiveWorld(start))
    expect(colliders.some((box) =>
      start.x + 0.5 >= box.minX && start.x - 0.5 <= box.maxX &&
      start.y + 0.5 >= box.minY && start.y - 0.5 <= box.maxY &&
      start.z + 0.5 >= box.minZ && start.z - 0.5 <= box.maxZ,
    )).toBe(false)
  })

  it('keeps a dense city within one block even thousands of units away', () => {
    for (const position of [{ x: 0, z: 0 }, { x: 2400, z: -3100 }, { x: -7800, z: 5200 }]) {
      const world = createActiveWorld(position)
      expect(world.buildings.length).toBeGreaterThanOrEqual(80)
      const nearest = Math.min(...world.buildings.map((building) =>
        Math.hypot(building.position.x - position.x, building.position.z - position.z),
      ))
      expect(nearest).toBeLessThanOrEqual(WORLD_CELL_SIZE * 1.15)
    }
    expect(WORLD_GROUND_RADIUS_CELLS * WORLD_CELL_SIZE).toBeGreaterThanOrEqual(WORLD_REMOVE_RADIUS)
  })

  it('retains spawned slots through the wider removal radius', () => {
    const initial = createActiveWorld({ x: 0, z: 0 })
    const shifted = updateActiveWorld(initial, { x: 32, z: 0 }, true)
    const retained = initial.buildings.filter((building) =>
      Math.hypot(building.position.x - 32, building.position.z) <= WORLD_REMOVE_RADIUS,
    )
    expect(shifted.buildings.some((building) => retained.some((item) => item.id === building.id))).toBe(true)
  })

  it('places mission anchors beside deterministic nearby buildings', () => {
    const first = missionBuildingAnchors({ x: 4000, z: -2600 }, 7, 3)
    const again = missionBuildingAnchors({ x: 4000, z: -2600 }, 7, 3)
    expect(first).toEqual(again)
    expect(first).toHaveLength(3)
    for (const anchor of first) {
      const distance = Math.hypot(anchor.position.x - anchor.building.position.x, anchor.position.z - anchor.building.position.z)
      expect(distance).toBeGreaterThan(Math.min(anchor.building.size.x, anchor.building.size.z) / 2)
    }
  })
})

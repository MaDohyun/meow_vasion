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

  it('keeps a sparser city active even thousands of units away', () => {
    for (const position of [{ x: 0, z: 0 }, { x: 2400, z: -3100 }, { x: -7800, z: 5200 }]) {
      const world = createActiveWorld(position)
      expect(world.buildings.length).toBeGreaterThanOrEqual(35)
      expect(world.buildings.length).toBeLessThanOrEqual(70)
    }
    expect(WORLD_GROUND_RADIUS_CELLS * WORLD_CELL_SIZE).toBeGreaterThanOrEqual(WORLD_REMOVE_RADIUS)
  })

  it('keeps building footprints inside the road-free cell interior', () => {
    let buildings = 0
    for (let cellZ = -30; cellZ <= 30; cellZ += 1) {
      for (let cellX = -30; cellX <= 30; cellX += 1) {
        const building = getProceduralCell(cellX, cellZ).building
        if (!building) continue
        buildings += 1
        expect(building.size.x).toBeGreaterThanOrEqual(16)
        expect(building.size.x).toBeLessThanOrEqual(22)
        expect(building.size.z).toBeGreaterThanOrEqual(16)
        expect(building.size.z).toBeLessThanOrEqual(22)
        expect(building.position.x - building.size.x / 2 - cellX * WORLD_CELL_SIZE).toBeGreaterThanOrEqual(4.5 - 1e-8)
        expect((cellX + 1) * WORLD_CELL_SIZE - building.position.x - building.size.x / 2).toBeGreaterThanOrEqual(4.5 - 1e-8)
        expect(building.position.z - building.size.z / 2 - cellZ * WORLD_CELL_SIZE).toBeGreaterThanOrEqual(4.5 - 1e-8)
        expect((cellZ + 1) * WORLD_CELL_SIZE - building.position.z - building.size.z / 2).toBeGreaterThanOrEqual(4.5 - 1e-8)
      }
    }
    expect(buildings / (61 * 61)).toBeGreaterThan(0.3)
    expect(buildings / (61 * 61)).toBeLessThan(0.36)
  })

  it('mixes mostly low-rise buildings with a meaningful high-rise tier', () => {
    const heights = [] as number[]
    for (let z = -35; z <= 35; z += 1) {
      for (let x = -35; x <= 35; x += 1) {
        const building = getProceduralCell(x, z).building
        if (building) heights.push(building.size.y)
      }
    }
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(7)
    expect(Math.max(...heights)).toBeGreaterThan(55)
    const highRiseRatio = heights.filter((height) => height >= 25).length / heights.length
    expect(highRiseRatio).toBeGreaterThan(0.25)
    expect(highRiseRatio).toBeLessThan(0.35)
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

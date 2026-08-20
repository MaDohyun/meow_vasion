import { describe, expect, it } from 'vitest'
import {
  activeWorldColliders,
  createActiveWorld,
  getProceduralCell,
  seedForWorldCell,
  updateActiveWorld,
  WORLD_MAX_BUILDINGS,
  WORLD_MAX_CARS,
  WORLD_MAX_DISTANT_BUILDINGS,
  WORLD_CELL_SIZE,
  WORLD_GROUND_RADIUS_CELLS,
  WORLD_LOD_RADIUS,
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
    expect(returned.distantBuildings).toEqual(initial.distantBuildings)
    expect(returned.cars).toEqual(initial.cars)
  })

  it('keeps active object pools bounded and creates only local colliders', () => {
    const world = createActiveWorld({ x: 0, z: 0 })
    expect(world.buildings.length).toBeLessThanOrEqual(WORLD_MAX_BUILDINGS)
    expect(world.distantBuildings.length).toBeLessThanOrEqual(WORLD_MAX_DISTANT_BUILDINGS)
    expect(world.cars.length).toBeLessThanOrEqual(WORLD_MAX_CARS)
    expect(activeWorldColliders(world)).toHaveLength(world.buildings.length)
    for (const object of [...world.buildings, ...world.cars]) {
      expect(Math.hypot(object.position.x, object.position.z)).toBeLessThanOrEqual(WORLD_SPAWN_RADIUS)
    }
    for (const building of world.distantBuildings) {
      const distance = Math.hypot(building.position.x, building.position.z)
      expect(distance).toBeGreaterThan(WORLD_SPAWN_RADIUS)
      expect(distance).toBeLessThanOrEqual(WORLD_LOD_RADIUS)
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
      expect(world.buildings.length).toBeGreaterThanOrEqual(70)
      expect(world.buildings.length).toBeLessThanOrEqual(WORLD_MAX_BUILDINGS)
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
    // Density band, not a fixed number: the point is that the city stays a city
    // rather than a field or a solid block. Raised from ~48% when the skyline
    // was thickened by about a third.
    expect(buildings / (61 * 61)).toBeGreaterThan(0.57)
    expect(buildings / (61 * 61)).toBeLessThan(0.67)
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

  it('uses the requested deterministic four-band height distribution', () => {
    const heights: number[] = []
    const grounds = new Set<string>()
    for (let z = -90; z <= 90; z += 1) {
      for (let x = -90; x <= 90; x += 1) {
        const cell = getProceduralCell(x, z)
        grounds.add(cell.ground)
        if (cell.building) heights.push(cell.building.size.y)
      }
    }
    const ratio = (minimum: number, maximum: number) => heights.filter((height) => height >= minimum && height < maximum).length / heights.length
    expect(ratio(7, 20)).toBeGreaterThan(0.56)
    expect(ratio(7, 20)).toBeLessThan(0.64)
    expect(ratio(20, 40)).toBeGreaterThan(0.27)
    expect(ratio(20, 40)).toBeLessThan(0.33)
    expect(ratio(40, 65)).toBeGreaterThan(0.06)
    expect(ratio(40, 65)).toBeLessThan(0.1)
    expect(ratio(65, 91)).toBeGreaterThan(0.01)
    expect(ratio(65, 91)).toBeLessThan(0.03)
    expect(grounds).toEqual(new Set(['grass', 'parking', 'sand', 'plaza', 'pond', 'vacant']))
  })

  it('retains spawned slots through the wider removal radius', () => {
    const initial = createActiveWorld({ x: 0, z: 0 })
    const shifted = updateActiveWorld(initial, { x: 32, z: 0 }, true)
    const retained = initial.buildings.filter((building) =>
      Math.hypot(building.position.x - 32, building.position.z) <= WORLD_REMOVE_RADIUS,
    )
    expect(shifted.buildings.some((building) => retained.some((item) => item.id === building.id))).toBe(true)
  })

})

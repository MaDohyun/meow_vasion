import { describe, expect, it } from 'vitest'
import {
  activeWorldColliders,
  createActiveWorld,
  ENTRANCE_VARIANTS,
  FACADE_TILE_METRES,
  FACADE_VARIANTS,
  getProceduralCell,
  type ProceduralBuilding,
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
  isTutorialCell,
  lakeClusterForCell,
  mysteryCircleForCell,
  parkClusterForCell,
  sameLandmarkCluster,
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

  it('reserves the complete tutorial 3x3 with no buildings, cars or lakes', () => {
    let cells = 0
    for (let z = -4; z <= 5; z += 1) {
      for (let x = -4; x <= 4; x += 1) {
        if (!isTutorialCell(x, z)) continue
        cells += 1
        const cell = getProceduralCell(x, z)
        expect(cell.building).toBeUndefined()
        expect(cell.car).toBeUndefined()
        expect(lakeClusterForCell(x, z)).toBeNull()
      }
    }
    expect(cells).toBe(9)
  })

  it('builds every deterministic lake from two to four joined cells', () => {
    const clusters = new Map<string, Array<[number, number]>>()
    for (let z = -60; z <= 60; z += 1) {
      for (let x = -60; x <= 60; x += 1) {
        const id = lakeClusterForCell(x, z)
        if (!id) continue
        const cells = clusters.get(id) ?? []
        cells.push([x, z])
        clusters.set(id, cells)
      }
    }
    expect(clusters.size).toBeGreaterThan(10)
    for (const cells of clusters.values()) {
      expect(cells.length).toBeGreaterThanOrEqual(2)
      expect(cells.length).toBeLessThanOrEqual(4)
      const connected = cells.every(([x, z], index) => index === 0 || cells.some(([ox, oz]) => Math.abs(ox - x) + Math.abs(oz - z) === 1))
      expect(connected).toBe(true)
    }
  })

  it('places rare mystery circles on empty tiles only', () => {
    const circles: Array<[number, number]> = []
    for (let z = -80; z <= 80; z += 1) {
      for (let x = -80; x <= 80; x += 1) {
        if (!mysteryCircleForCell(x, z)) continue
        circles.push([x, z])
        const cell = getProceduralCell(x, z)
        expect(cell.kind).toBe('empty')
        expect(cell.building).toBeUndefined()
        expect(cell.car).toBeUndefined()
      }
    }
    expect(circles.length).toBeGreaterThan(20)
    expect(new Set(circles.map(([x, z]) => mysteryCircleForCell(x, z))).size).toBe(circles.length)
  })

  it('generates deterministic one-to-nine tile parks with no internal roads', () => {
    const clusters = new Map<string, Array<[number, number]>>()
    for (let z = -80; z <= 80; z += 1) {
      for (let x = -80; x <= 80; x += 1) {
        const id = parkClusterForCell(x, z)
        if (!id || id === 'park:tutorial') continue
        const cells = clusters.get(id) ?? []
        cells.push([x, z])
        clusters.set(id, cells)
      }
    }
    expect(clusters.size).toBeGreaterThan(30)
    const sizes = new Set<number>()
    for (const cells of clusters.values()) {
      sizes.add(cells.length)
      expect(cells.length).toBeGreaterThanOrEqual(1)
      expect(cells.length).toBeLessThanOrEqual(9)
      for (const [x, z] of cells) {
        const cell = getProceduralCell(x, z)
        expect(cell.building).toBeUndefined()
        expect(cell.car).toBeUndefined()
        expect(lakeClusterForCell(x, z)).toBeNull()
      }
      const [firstX, firstZ] = cells[0]!
      const neighbour = cells.find(([x, z]) => Math.abs(x - firstX) + Math.abs(z - firstZ) === 1)
      if (neighbour) expect(sameLandmarkCluster(firstX, firstZ, neighbour[0], neighbour[1])).toBe(true)
    }
    // The sector table deliberately includes every footprint size, not only
    // squares, so a distant city has pocket gardens and full-block parks.
    for (let size = 1; size <= 9; size += 1) expect(sizes.has(size)).toBe(true)
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
        if (building.largeFootprint) {
          expect(building.size.x).toBeGreaterThanOrEqual(23.5)
          expect(building.size.x).toBeLessThanOrEqual(25)
          expect(building.size.z).toBeGreaterThanOrEqual(23.5)
          expect(building.size.z).toBeLessThanOrEqual(25)
          expect(building.size.y).toBeGreaterThanOrEqual(10)
          expect(building.size.y).toBeLessThanOrEqual(15)
        } else {
          expect(building.size.x).toBeGreaterThanOrEqual(16)
          expect(building.size.x).toBeLessThanOrEqual(22)
          expect(building.size.z).toBeGreaterThanOrEqual(16)
          expect(building.size.z).toBeLessThanOrEqual(22)
        }
        expect(building.position.x - building.size.x / 2 - cellX * WORLD_CELL_SIZE).toBeGreaterThanOrEqual(4.5 - 1e-8)
        expect((cellX + 1) * WORLD_CELL_SIZE - building.position.x - building.size.x / 2).toBeGreaterThanOrEqual(4.5 - 1e-8)
        expect(building.position.z - building.size.z / 2 - cellZ * WORLD_CELL_SIZE).toBeGreaterThanOrEqual(4.5 - 1e-8)
        expect((cellZ + 1) * WORLD_CELL_SIZE - building.position.z - building.size.z / 2).toBeGreaterThanOrEqual(4.5 - 1e-8)
      }
    }
    expect(buildings / (61 * 61)).toBeGreaterThan(0.45)
    expect(buildings / (61 * 61)).toBeLessThan(0.50)
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

describe('building variety', () => {
  const sample = () => {
    const buildings: ProceduralBuilding[] = []
    for (let cellX = -14; cellX <= 14; cellX += 1) {
      for (let cellZ = -14; cellZ <= 14; cellZ += 1) {
        const cell = getProceduralCell(cellX, cellZ)
        if (cell.building) buildings.push(cell.building)
      }
    }
    return buildings
  }

  it('gives every building a facade, an entrance and a form in range', () => {
    for (const building of sample()) {
      expect(building.facade).toBeGreaterThanOrEqual(0)
      expect(building.facade).toBeLessThan(FACADE_VARIANTS)
      expect(Number.isInteger(building.facade)).toBe(true)
      expect(building.entrance).toBeGreaterThanOrEqual(0)
      expect(building.entrance).toBeLessThan(ENTRANCE_VARIANTS)
      expect(Number.isInteger(building.entrance)).toBe(true)
      expect(['plain', 'podium', 'setback']).toContain(building.form)
    }
  })

  it('counts floors as whole numbers that track height', () => {
    // A fraction would slice the top storey in half, and a floor count that
    // did not track height is the thing that made a tower read as a big shop.
    const buildings = sample()
    for (const building of buildings) {
      expect(Number.isInteger(building.floors)).toBe(true)
      expect(building.floors).toBeGreaterThanOrEqual(1)
      // Storey height stays within a believable band across the whole city.
      const metresPerTile = building.size.y / building.floors
      expect(metresPerTile).toBeGreaterThan(4)
      expect(metresPerTile).toBeLessThan(FACADE_TILE_METRES * 1.6)
    }
    const tallest = buildings.reduce((a, b) => (a.size.y > b.size.y ? a : b))
    const shortest = buildings.reduce((a, b) => (a.size.y < b.size.y ? a : b))
    expect(tallest.floors).toBeGreaterThan(shortest.floors)
  })

  it('actually spreads across the variants rather than favouring one', () => {
    // The point of sixteen facades is sixteen facades. A hash that clumped
    // would leave the street looking copied even with the atlas widened.
    const buildings = sample()
    expect(buildings.length).toBeGreaterThan(200)
    const facades = new Set(buildings.map((building) => building.facade))
    const entrances = new Set(buildings.map((building) => building.entrance))
    const forms = new Set(buildings.map((building) => building.form))
    expect(facades.size).toBe(FACADE_VARIANTS)
    expect(entrances.size).toBe(ENTRANCE_VARIANTS)
    expect(forms.size).toBe(3)
    for (let variant = 0; variant < FACADE_VARIANTS; variant += 1) {
      const share = buildings.filter((building) => building.facade === variant).length / buildings.length
      expect(share, `facade ${variant}`).toBeGreaterThan(0.02)
    }
  })

  it('keeps a building look fixed as the city streams', () => {
    // Re-deriving a cell must give the same building. If it did not, a tower
    // would change its windows and its shape as the player flew past it.
    for (const cell of [[3, -7], [-11, 2], [0, 0], [9, 9]] as const) {
      const first = getProceduralCell(cell[0], cell[1]).building
      const second = getProceduralCell(cell[0], cell[1]).building
      expect(second?.facade).toBe(first?.facade)
      expect(second?.floors).toBe(first?.floors)
      expect(second?.entrance).toBe(first?.entrance)
      expect(second?.form).toBe(first?.form)
      expect(second?.roofOverhang).toBe(first?.roofOverhang)
    }
  })
})

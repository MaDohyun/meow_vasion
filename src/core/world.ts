import type { Aabb, Vec3 } from './drone'

export const WORLD_SEED = 1
export const WORLD_CELL_SIZE = 34
export const WORLD_SPAWN_RADIUS = 250
export const WORLD_REMOVE_RADIUS = 300
/** Far enough that a grown craft, whose fog reaches further, still has city
 *  out there to reveal rather than an empty ring. */
export const WORLD_LOD_RADIUS = 820
export const WORLD_REFRESH_DISTANCE = 10
export const WORLD_MAX_BUILDINGS = 128
export const WORLD_MAX_DISTANT_BUILDINGS = 880
export const WORLD_MAX_CARS = 48
export const WORLD_GROUND_RADIUS_CELLS = 9
export const TUTORIAL_SPAWN = { x: 0, y: 7, z: 54.5 } as const
export const TUTORIAL_CELL_X = 0
export const TUTORIAL_CELL_Z = 1

export const BUILDING_STYLES = [
  { color: '#f29b9a', roof: '#d7798e' },
  { color: '#8ec9d8', roof: '#6faabc' },
  { color: '#f3c887', roof: '#dda278' },
  { color: '#b9a0dc', roof: '#927cc2' },
  { color: '#9bcda2', roof: '#76ad87' },
  { color: '#efad98', roof: '#d5837d' },
  { color: '#91c8cf', roof: '#6ba5b1' },
  { color: '#efd29b', roof: '#d9a879' },
  { color: '#e4a5bc', roof: '#be829f' },
  { color: '#a4d1e2', roof: '#7daabd' },
  { color: '#e2b36f', roof: '#b97d50' },
] as const

export const BUILDING_SIGN_LABELS = [
  'RAMEN', 'HOTEL', 'ARCADE', 'CAFE 24', 'MARKET',
  'DINER', 'VIDEO', 'SKY', 'CLINIC', 'DEPOT',
  'MEGA MART',
] as const

export const BUILDING_SIGN_COLORS = ['#ffe66b', '#ff7bbf', '#78ffcf', '#ffdb5d', '#81ffd1'] as const
export const PARKED_CAR_COLORS = ['#f38ca0', '#83cde3', '#f2cf7d', '#b6a0e1'] as const

/**
 * How a building meets the ground and the sky.
 *
 * Every building used to be the same extruded box, which is most of why a
 * street of them read as one building copied along the block. A base that is
 * wider than the tower, or a top that steps in, changes the silhouette without
 * changing the body - the shape variation the eye picks up at a distance is
 * almost entirely in those two places.
 */
export type BuildingForm = 'plain' | 'podium' | 'setback'

/** Facade variants in the atlas. A 4x4 sheet: sixteen window layouts, not
 *  sixteen phase shifts of one grid. */
export const FACADE_VARIANTS = 16

/** Ground-floor fronts. */
export const ENTRANCE_VARIANTS = 6

/**
 * Roughly how much building one tile of the facade covers, in metres.
 *
 * The facade used to be stretched once over the whole face, so a seven-metre
 * shop and a ninety-metre tower both showed six rows of windows and the tower
 * read as a large shop rather than as a tower. Tiling by a fixed height instead
 * gives every building in the city the same storey height, which is what makes
 * one of them read as taller than another.
 */
export const FACADE_TILE_METRES = 10.5

export type WorldCellKind = 'building' | 'parked-car' | 'empty' | 'intersection'
export type GroundVariant = 'grass' | 'parking' | 'sand' | 'plaza' | 'pond' | 'vacant'

export type ProceduralBuilding = {
  id: string
  cellX: number
  cellZ: number
  position: Vec3
  size: Vec3
  color: string
  roof: string
  sign: {
    text: string
    color: string
    side: 'x' | 'z'
  }
  /** Which facade variant this building wears, 0..FACADE_VARIANTS-1. */
  facade: number
  /** How many times the facade tiles up the face. Always a whole number: a
   *  fraction would slice the top storey in half. */
  floors: number
  /** Which ground-floor front, 0..ENTRANCE_VARIANTS-1. */
  entrance: number
  form: BuildingForm
  /** Roof slab proportions, so the cornice line is not identical everywhere. */
  roofOverhang: number
  roofThickness: number
  /** A rare low, wide anchor building that breaks up the repeated towers. */
  largeFootprint?: boolean
}

export type ProceduralCar = {
  id: string
  cellX: number
  cellZ: number
  position: Vec3
  rotation: number
  color: string
}

export type ProceduralCell = {
  id: string
  cellX: number
  cellZ: number
  seed: number
  kind: WorldCellKind
  ground: GroundVariant
  building?: ProceduralBuilding
  car?: ProceduralCar
}

export type ActiveWorld = {
  center: Pick<Vec3, 'x' | 'z'>
  cellX: number
  cellZ: number
  buildings: ProceduralBuilding[]
  distantBuildings: ProceduralBuilding[]
  cars: ProceduralCar[]
  key: string
}

const unsigned = (value: number) => value >>> 0
const unit = (seed: number, shift: number) => ((seed >>> shift) & 0xff) / 255

function saltedUnit(seed: number, salt: number) {
  let value = seed ^ Math.imul(salt, 0x9e3779b1)
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d)
  value ^= value >>> 15
  return (value >>> 0) / 0xffffffff
}

export function seedForWorldCell(cellX: number, cellZ: number, worldSeed = WORLD_SEED) {
  let seed = Math.imul(cellX, 73856093) ^ Math.imul(cellZ, 19349663) ^ worldSeed
  seed ^= seed >>> 16
  seed = Math.imul(seed, 0x7feb352d)
  seed ^= seed >>> 15
  seed = Math.imul(seed, 0x846ca68b)
  seed ^= seed >>> 16
  return unsigned(seed)
}

export function worldCellCoord(value: number) {
  return Math.floor(value / WORLD_CELL_SIZE)
}

export function worldCellCenter(cell: number) {
  return (cell + 0.5) * WORLD_CELL_SIZE
}

/** The opening park is a permanent, deterministic exception in the grid. */
export function isTutorialCell(cellX: number, cellZ: number) {
  return Math.abs(cellX - TUTORIAL_CELL_X) <= 1 && Math.abs(cellZ - TUTORIAL_CELL_Z) <= 1
}

const LAKE_SECTOR_SIZE = 6
const LAKE_SHAPES = [
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
] as const

// Parks use the same deterministic-sector pattern as lakes, but cover a wider
// range of connected footprints: a pocket lawn through a full 3x3 city block.
// They are generated from coordinates only, so leaving and returning to a
// district reconstructs exactly the same green space without storing it.
const PARK_SECTOR_SIZE = 8
const PARK_SHAPES = [
  [[0, 0]],
  [[0, 0], [1, 0]],
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
] as const

/** Returns the deterministic 1–9 tile park cluster that owns a cell. */
export function parkClusterForCell(cellX: number, cellZ: number) {
  if (isTutorialCell(cellX, cellZ)) return 'park:tutorial'
  const sectorX = Math.floor(cellX / PARK_SECTOR_SIZE)
  const sectorZ = Math.floor(cellZ / PARK_SECTOR_SIZE)
  const seed = seedForWorldCell(sectorX, sectorZ, 0x7061726b)
  if (seed % 100 >= 18) return null
  // A two-cell margin prevents a 3x3 footprint in neighbouring sectors from
  // touching or overlapping, which keeps every generated park unambiguous.
  const anchorX = sectorX * PARK_SECTOR_SIZE + 2 + ((seed >>> 9) % 3)
  const anchorZ = sectorZ * PARK_SECTOR_SIZE + 2 + ((seed >>> 13) % 3)
  const shape = PARK_SHAPES[(seed >>> 17) % PARK_SHAPES.length]!
  if (shape.some(([dx, dz]) => isTutorialCell(anchorX + dx, anchorZ + dz) || lakeClusterForCell(anchorX + dx, anchorZ + dz))) return null
  const member = shape.some(([dx, dz]) => cellX === anchorX + dx && cellZ === anchorZ + dz)
  return member ? `park:${sectorX}:${sectorZ}` : null
}

/**
 * Returns a stable cluster id for the two-to-four joined cells of a lake.
 * Clusters stay inside a six-cell sector, so checking membership is constant
 * work and never needs stored skyline/terrain data.
 */
export function lakeClusterForCell(cellX: number, cellZ: number) {
  if (isTutorialCell(cellX, cellZ)) return null
  const sectorX = Math.floor(cellX / LAKE_SECTOR_SIZE)
  const sectorZ = Math.floor(cellZ / LAKE_SECTOR_SIZE)
  const seed = seedForWorldCell(sectorX, sectorZ, 0x1a6e)
  if (seed % 100 >= 24) return null
  const anchorX = sectorX * LAKE_SECTOR_SIZE + 1 + ((seed >>> 9) % 2)
  const anchorZ = sectorZ * LAKE_SECTOR_SIZE + 1 + ((seed >>> 13) % 2)
  const shape = LAKE_SHAPES[(seed >>> 17) % LAKE_SHAPES.length]!
  if (shape.some(([dx, dz]) => isTutorialCell(anchorX + dx, anchorZ + dz))) return null
  const member = shape.some(([dx, dz]) => cellX === anchorX + dx && cellZ === anchorZ + dz)
  return member ? `lake:${sectorX}:${sectorZ}` : null
}

/** Adjacent cells in one landmark cluster do not need an internal road seam. */
export function sameLandmarkCluster(aX: number, aZ: number, bX: number, bZ: number) {
  const park = parkClusterForCell(aX, aZ)
  if (park !== null && park === parkClusterForCell(bX, bZ)) return true
  const left = lakeClusterForCell(aX, aZ)
  return left !== null && left === lakeClusterForCell(bX, bZ)
}

export function isLakeAt(position: Pick<Vec3, 'x' | 'z'>) {
  return lakeClusterForCell(worldCellCoord(position.x), worldCellCoord(position.z)) !== null
}

export function isParkAt(position: Pick<Vec3, 'x' | 'z'>) {
  return parkClusterForCell(worldCellCoord(position.x), worldCellCoord(position.z)) !== null
}

/**
 * Metres from the nearest shore, 0 at the water's edge and outside it.
 *
 * Beam drag near a lake used to be a flat on/off switch the moment the craft
 * crossed the shoreline, which made the edge itself the slow part - the
 * opposite of "wading in". Reusing the same open/closed edge test WaterPool
 * uses to shape the water mesh gives a real distance-to-shore instead, so the
 * drag can ramp in as the craft actually moves toward open water.
 */
export function lakeDepthAt(position: Pick<Vec3, 'x' | 'z'>) {
  const cellX = worldCellCoord(position.x)
  const cellZ = worldCellCoord(position.z)
  if (!lakeClusterForCell(cellX, cellZ)) return 0
  const localX = position.x - cellX * WORLD_CELL_SIZE
  const localZ = position.z - cellZ * WORLD_CELL_SIZE
  const westOpen = !sameLandmarkCluster(cellX, cellZ, cellX - 1, cellZ)
  const eastOpen = !sameLandmarkCluster(cellX, cellZ, cellX + 1, cellZ)
  const southOpen = !sameLandmarkCluster(cellX, cellZ, cellX, cellZ - 1)
  const northOpen = !sameLandmarkCluster(cellX, cellZ, cellX, cellZ + 1)
  let depth = Infinity
  if (westOpen) depth = Math.min(depth, localX)
  if (eastOpen) depth = Math.min(depth, WORLD_CELL_SIZE - localX)
  if (southOpen) depth = Math.min(depth, localZ)
  if (northOpen) depth = Math.min(depth, WORLD_CELL_SIZE - localZ)
  // An interior cell of a multi-cell lake has no shore edge of its own -
  // every neighbour is more water, so treat it as fully deep.
  return Number.isFinite(depth) ? Math.max(0, depth) : WORLD_CELL_SIZE / 2
}

export function getProceduralCell(cellX: number, cellZ: number, worldSeed = WORLD_SEED): ProceduralCell {
  const seed = seedForWorldCell(cellX, cellZ, worldSeed)
  const roll = seed % 100
  const park = parkClusterForCell(cellX, cellZ)
  const forcedOpen = park !== null
  const lake = lakeClusterForCell(cellX, cellZ)
  // Bands: building 48%, parked car 10%, intersection 12%, empty 30%.
  const kind: WorldCellKind = forcedOpen || lake
    ? 'empty'
    : roll < 48
    ? 'building'
    : roll < 58
      ? 'parked-car'
      : roll < 70
        ? 'intersection'
        : 'empty'
  const id = `${cellX}:${cellZ}`
  const centerX = worldCellCenter(cellX)
  const centerZ = worldCellCenter(cellZ)
  const groundVariants: GroundVariant[] = ['grass', 'parking', 'sand', 'plaza', 'pond', 'vacant']
  const ground = lake ? 'pond' : groundVariants[Math.floor(saltedUnit(seed, 19) * groundVariants.length)] ?? 'vacant'

  if (kind === 'building') {
    const largeFootprint = seed % 100 < 3
    const styleIndex = largeFootprint ? BUILDING_STYLES.length - 1 : (seed >>> 8) % (BUILDING_STYLES.length - 1)
    const style = BUILDING_STYLES[styleIndex]!
    const sizeX = largeFootprint ? 23.5 + saltedUnit(seed, 1) * 1.2 : 16 + saltedUnit(seed, 1) * 6
    const sizeZ = largeFootprint ? 23.5 + saltedUnit(seed, 2) * 1.2 : 16 + saltedUnit(seed, 2) * 6
    const heightBand = saltedUnit(seed, 3)
    const heightVariation = saltedUnit(seed, 4)
    const sizeY = largeFootprint
      ? 10 + heightVariation * 5
      : heightBand < 0.6
        ? 7 + heightVariation * 13
        : heightBand < 0.9
          ? 20 + heightVariation * 20
          : heightBand < 0.98
            ? 40 + heightVariation * 25
            : 65 + heightVariation * 25
    const roadInset = 4.5
    const minX = cellX * WORLD_CELL_SIZE + roadInset + sizeX / 2
    const maxX = (cellX + 1) * WORLD_CELL_SIZE - roadInset - sizeX / 2
    const minZ = cellZ * WORLD_CELL_SIZE + roadInset + sizeZ / 2
    const maxZ = (cellZ + 1) * WORLD_CELL_SIZE - roadInset - sizeZ / 2
    const desiredX = centerX + (saltedUnit(seed, 5) - 0.5) * (largeFootprint ? 5 : 15)
    const desiredZ = centerZ + (saltedUnit(seed, 6) - 0.5) * (largeFootprint ? 5 : 15)
    // A podium needs a building tall enough to have something above it, and a
    // setback needs enough height for the step to be visible rather than a lip.
    const formRoll = saltedUnit(seed, 31)
    const form: BuildingForm = sizeY >= 34 && formRoll < 0.3
      ? 'setback'
      : sizeY >= 16 && formRoll < 0.58
        ? 'podium'
        : 'plain'
    const building: ProceduralBuilding = {
      id: `building:${id}`,
      cellX,
      cellZ,
      position: {
        x: Math.max(minX, Math.min(maxX, desiredX)),
        y: sizeY / 2,
        z: Math.max(minZ, Math.min(maxZ, desiredZ)),
      },
      size: { x: sizeX, y: sizeY, z: sizeZ },
      color: style.color,
      roof: style.roof,
      sign: {
        text: largeFootprint ? 'MEGA MART' : BUILDING_SIGN_LABELS[(seed >>> 19) % (BUILDING_SIGN_LABELS.length - 1)]!,
        color: BUILDING_SIGN_COLORS[(seed >>> 23) % BUILDING_SIGN_COLORS.length]!,
        side: (seed & 0x40000000) === 0 ? 'z' : 'x',
      },
      facade: Math.floor(saltedUnit(seed, 27) * FACADE_VARIANTS) % FACADE_VARIANTS,
      floors: Math.max(1, Math.round(sizeY / FACADE_TILE_METRES)),
      entrance: Math.floor(saltedUnit(seed, 29) * ENTRANCE_VARIANTS) % ENTRANCE_VARIANTS,
      form,
      roofOverhang: 0.87 + saltedUnit(seed, 33) * 0.17,
      roofThickness: 0.5 + saltedUnit(seed, 35) * 0.75,
      largeFootprint,
    }
    return { id, cellX, cellZ, seed, kind, ground, building }
  }

  if (kind === 'parked-car') {
    const horizontal = (seed & 0x100) !== 0
    const car: ProceduralCar = {
      id: `car:${id}`,
      cellX,
      cellZ,
      position: {
        x: centerX + (horizontal ? 0 : (unit(seed, 4) - 0.5) * 13),
        y: 0.65,
        z: centerZ + (horizontal ? (unit(seed, 12) - 0.5) * 13 : 0),
      },
      rotation: horizontal ? Math.PI / 2 : 0,
      color: PARKED_CAR_COLORS[(seed >>> 17) % PARKED_CAR_COLORS.length]!,
    }
    return { id, cellX, cellZ, seed, kind, ground, car }
  }

  return { id, cellX, cellZ, seed, kind, ground }
}

function horizontalDistance(position: Pick<Vec3, 'x' | 'z'>, target: Pick<Vec3, 'x' | 'z'>) {
  return Math.hypot(position.x - target.x, position.z - target.z)
}

function cellsAround(position: Pick<Vec3, 'x' | 'z'>, radius: number) {
  const centerX = worldCellCoord(position.x)
  const centerZ = worldCellCoord(position.z)
  const cellRadius = Math.ceil(radius / WORLD_CELL_SIZE) + 1
  const cells: ProceduralCell[] = []
  for (let z = centerZ - cellRadius; z <= centerZ + cellRadius; z += 1) {
    for (let x = centerX - cellRadius; x <= centerX + cellRadius; x += 1) cells.push(getProceduralCell(x, z))
  }
  return cells
}

function nearestLimited<T extends { id: string; position: Vec3 }>(
  items: Iterable<T>,
  position: Pick<Vec3, 'x' | 'z'>,
  limit: number,
) {
  return [...items]
    .sort((left, right) => horizontalDistance(position, left.position) - horizontalDistance(position, right.position) || left.id.localeCompare(right.id))
    .slice(0, limit)
}

function activationKey(buildings: ProceduralBuilding[], distantBuildings: ProceduralBuilding[], cars: ProceduralCar[], cellX: number, cellZ: number) {
  return `${cellX}:${cellZ}|${buildings.map((item) => item.id).join(',')}|${distantBuildings.map((item) => item.id).join(',')}|${cars.map((item) => item.id).join(',')}`
}

export function createActiveWorld(position: Pick<Vec3, 'x' | 'z'>): ActiveWorld {
  return updateActiveWorld(null, position, true)
}

export function updateActiveWorld(
  previous: ActiveWorld | null,
  position: Pick<Vec3, 'x' | 'z'>,
  force = false,
  /** Buildings the player has eaten. Streaming must not bring them back. */
  removed?: ReadonlySet<string>,
): ActiveWorld {
  if (previous && !force && horizontalDistance(previous.center, position) < WORLD_REFRESH_DISTANCE) return previous

  const candidates = cellsAround(position, WORLD_LOD_RADIUS)
  const buildingPool = new Map<string, ProceduralBuilding>()
  const carPool = new Map<string, ProceduralCar>()

  if (previous) {
    for (const building of previous.buildings) {
      if (horizontalDistance(position, building.position) <= WORLD_REMOVE_RADIUS) buildingPool.set(building.id, building)
    }
    for (const car of previous.cars) {
      if (horizontalDistance(position, car.position) <= WORLD_REMOVE_RADIUS) carPool.set(car.id, car)
    }
  }

  const spawnCells = candidates
    .filter((cell) => {
      const object = cell.building ?? cell.car
      return object && horizontalDistance(position, object.position) <= WORLD_SPAWN_RADIUS
    })
    .sort((left, right) => {
      const leftObject = left.building ?? left.car!
      const rightObject = right.building ?? right.car!
      return horizontalDistance(position, leftObject.position) - horizontalDistance(position, rightObject.position) || left.id.localeCompare(right.id)
    })

  for (const cell of spawnCells) {
    if (cell.building) buildingPool.set(cell.building.id, cell.building)
    if (cell.car) carPool.set(cell.car.id, cell.car)
  }

  // An eaten building is gone for good, near and far alike - seeing one you
  // swallowed still standing on the skyline would undo the whole act.
  if (removed && removed.size > 0) for (const id of removed) buildingPool.delete(id)
  const buildings = nearestLimited(buildingPool.values(), position, WORLD_MAX_BUILDINGS)
  const cars = nearestLimited(carPool.values(), position, WORLD_MAX_CARS)
  const nearBuildingIds = new Set(buildings.map((building) => building.id))
  const distantBuildings = nearestLimited(
    candidates
      .flatMap((cell) => cell.building ? [cell.building] : [])
      .filter((building) => {
        const distance = horizontalDistance(position, building.position)
        if (removed?.has(building.id)) return false
        return distance > WORLD_SPAWN_RADIUS && distance <= WORLD_LOD_RADIUS && !nearBuildingIds.has(building.id)
      }),
    position,
    WORLD_MAX_DISTANT_BUILDINGS,
  )
  const cellX = worldCellCoord(position.x)
  const cellZ = worldCellCoord(position.z)
  return {
    center: { x: position.x, z: position.z },
    cellX,
    cellZ,
    buildings,
    distantBuildings,
    cars,
    key: activationKey(buildings, distantBuildings, cars, cellX, cellZ),
  }
}

/**
 * A building's mass, and the "diameter" the absorb gate measures it by.
 *
 * Mass comes off volume, but through a root rather than straight: buildings run
 * from a seven-metre shop to a ninety-metre tower, and raw volume makes the
 * tower tens of thousands of times the shop, which snaps the ladder rather than
 * extending it. Flattened, the two sit a few rungs apart, and those rungs are
 * what the second half of a run is reaching for.
 *
 * The gate measures footprint plus a discounted height. Height counts, because
 * a tower should be harder than a shop of the same plan - but at half weight,
 * because a tower is tall and thin rather than genuinely bulky.
 */
export function buildingMass(building: ProceduralBuilding) {
  if (building.size.y < 20) return 8
  if (building.size.y < 40) return 9
  if (building.size.y < 65) return 10
  return 11
}

export type BuildingHeightTier = 'low' | 'mid' | 'high' | 'supertall'

export function buildingHeightTier(building: Pick<ProceduralBuilding, 'size'>): BuildingHeightTier {
  if (building.size.y < 20) return 'low'
  if (building.size.y < 40) return 'mid'
  if (building.size.y < 65) return 'high'
  return 'supertall'
}

/**
 * Height counts at about a third. A tower has to be harder than a shop on the
 * same plan, but it is tall rather than genuinely bulky, and weighting height
 * any harder puts the tallest building in the city out of reach even at the
 * size ceiling - which would leave the last rung of the ladder unclimbable.
 */
export const BUILDING_HEIGHT_BULK = 0.35

export function buildingBulk(building: ProceduralBuilding) {
  return Math.max(building.size.x, building.size.z, building.size.y * BUILDING_HEIGHT_BULK)
}

export function activeWorldColliders(world: ActiveWorld): Aabb[] {
  return world.buildings.map((building) => ({
    id: building.id,
    minX: building.position.x - building.size.x / 2,
    maxX: building.position.x + building.size.x / 2,
    minY: 0,
    maxY: building.position.y + building.size.y / 2,
    minZ: building.position.z - building.size.z / 2,
    maxZ: building.position.z + building.size.z / 2,
  }))
}

export function groundCellsAround(position: Pick<Vec3, 'x' | 'z'>, radius = WORLD_GROUND_RADIUS_CELLS) {
  const centerX = worldCellCoord(position.x)
  const centerZ = worldCellCoord(position.z)
  const cells: ProceduralCell[] = []
  for (let z = -radius; z <= radius; z += 1) {
    for (let x = -radius; x <= radius; x += 1) cells.push(getProceduralCell(centerX + x, centerZ + z))
  }
  return cells
}

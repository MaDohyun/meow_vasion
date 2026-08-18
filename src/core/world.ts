import type { Aabb, Vec3 } from './drone'

export const WORLD_SEED = 1
export const WORLD_CELL_SIZE = 40
export const WORLD_SPAWN_RADIUS = 90
export const WORLD_REMOVE_RADIUS = 130
export const WORLD_REFRESH_DISTANCE = 10
export const WORLD_MAX_BUILDINGS = 24
export const WORLD_MAX_CARS = 12
export const WORLD_GROUND_RADIUS_CELLS = 4

export const BUILDING_STYLES = [
  { color: '#ef6b68', roof: '#c84864' },
  { color: '#42a6c8', roof: '#267899' },
  { color: '#f4b34f', roof: '#ce773f' },
  { color: '#9b70cf', roof: '#694aa6' },
  { color: '#69bd77', roof: '#44885c' },
  { color: '#ef8264', roof: '#c84f4b' },
  { color: '#4faabd', roof: '#33738e' },
  { color: '#e6b24d', roof: '#bb733e' },
  { color: '#d66e94', roof: '#954d83' },
  { color: '#6bb8d8', roof: '#3d7d9e' },
] as const

export const BUILDING_SIGN_LABELS = [
  'RAMEN', 'HOTEL', 'ARCADE', 'CAFE 24', 'MARKET',
  'DINER', 'VIDEO', 'SKY', 'CLINIC', 'DEPOT',
] as const

export const BUILDING_SIGN_COLORS = ['#ffe66b', '#ff7bbf', '#78ffcf', '#ffdb5d', '#81ffd1'] as const
export const PARKED_CAR_COLORS = ['#ff5d74', '#62d7ff', '#ffd15d', '#9c75ff'] as const

export type WorldCellKind = 'building' | 'parked-car' | 'empty' | 'intersection'

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
  building?: ProceduralBuilding
  car?: ProceduralCar
}

export type ActiveWorld = {
  center: Pick<Vec3, 'x' | 'z'>
  cellX: number
  cellZ: number
  buildings: ProceduralBuilding[]
  cars: ProceduralCar[]
  key: string
}

const unsigned = (value: number) => value >>> 0
const unit = (seed: number, shift: number) => ((seed >>> shift) & 0xff) / 255

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

export function getProceduralCell(cellX: number, cellZ: number, worldSeed = WORLD_SEED): ProceduralCell {
  const seed = seedForWorldCell(cellX, cellZ, worldSeed)
  const roll = seed % 100
  const kind: WorldCellKind = roll < 62
    ? 'building'
    : roll < 79
      ? 'parked-car'
      : roll < 90
        ? 'intersection'
        : 'empty'
  const id = `${cellX}:${cellZ}`
  const centerX = worldCellCenter(cellX)
  const centerZ = worldCellCenter(cellZ)

  if (kind === 'building') {
    const styleIndex = (seed >>> 8) % BUILDING_STYLES.length
    const style = BUILDING_STYLES[styleIndex]!
    const sizeX = 20 + unit(seed, 0) * 8
    const sizeZ = 20 + unit(seed, 8) * 8
    const sizeY = 14 + unit(seed, 16) * 26
    const building: ProceduralBuilding = {
      id: `building:${id}`,
      cellX,
      cellZ,
      position: {
        x: centerX + (unit(seed, 3) - 0.5) * 5,
        y: sizeY / 2,
        z: centerZ + (unit(seed, 11) - 0.5) * 5,
      },
      size: { x: sizeX, y: sizeY, z: sizeZ },
      color: style.color,
      roof: style.roof,
      sign: {
        text: BUILDING_SIGN_LABELS[(seed >>> 19) % BUILDING_SIGN_LABELS.length]!,
        color: BUILDING_SIGN_COLORS[(seed >>> 23) % BUILDING_SIGN_COLORS.length]!,
        side: (seed & 0x40000000) === 0 ? 'z' : 'x',
      },
    }
    return { id, cellX, cellZ, seed, kind, building }
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
    return { id, cellX, cellZ, seed, kind, car }
  }

  return { id, cellX, cellZ, seed, kind }
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

function activationKey(buildings: ProceduralBuilding[], cars: ProceduralCar[], cellX: number, cellZ: number) {
  return `${cellX}:${cellZ}|${buildings.map((item) => item.id).join(',')}|${cars.map((item) => item.id).join(',')}`
}

export function createActiveWorld(position: Pick<Vec3, 'x' | 'z'>): ActiveWorld {
  return updateActiveWorld(null, position, true)
}

export function updateActiveWorld(
  previous: ActiveWorld | null,
  position: Pick<Vec3, 'x' | 'z'>,
  force = false,
): ActiveWorld {
  if (previous && !force && horizontalDistance(previous.center, position) < WORLD_REFRESH_DISTANCE) return previous

  const candidates = cellsAround(position, WORLD_REMOVE_RADIUS)
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
    if (cell.building && buildingPool.size < WORLD_MAX_BUILDINGS) buildingPool.set(cell.building.id, cell.building)
    if (cell.car && carPool.size < WORLD_MAX_CARS) carPool.set(cell.car.id, cell.car)
  }

  const buildings = nearestLimited(buildingPool.values(), position, WORLD_MAX_BUILDINGS)
  const cars = nearestLimited(carPool.values(), position, WORLD_MAX_CARS)
  const cellX = worldCellCoord(position.x)
  const cellZ = worldCellCoord(position.z)
  return {
    center: { x: position.x, z: position.z },
    cellX,
    cellZ,
    buildings,
    cars,
    key: activationKey(buildings, cars, cellX, cellZ),
  }
}

export function activeWorldColliders(world: ActiveWorld): Aabb[] {
  return world.buildings.map((building) => ({
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

export function missionBuildingAnchors(
  position: Pick<Vec3, 'x' | 'z'>,
  missionIndex: number,
  count: number,
) {
  const searchRadius = WORLD_REMOVE_RADIUS + WORLD_CELL_SIZE * 2
  const candidates = cellsAround(position, searchRadius)
    .flatMap((cell) => cell.building ? [cell.building] : [])
    .filter((building) => horizontalDistance(position, building.position) <= searchRadius)
    .sort((left, right) => {
      const leftSeed = seedForWorldCell(left.cellX, left.cellZ, missionIndex + 17)
      const rightSeed = seedForWorldCell(right.cellX, right.cellZ, missionIndex + 17)
      const leftScore = horizontalDistance(position, left.position) + (leftSeed % 1000) / 250
      const rightScore = horizontalDistance(position, right.position) + (rightSeed % 1000) / 250
      return leftScore - rightScore || left.id.localeCompare(right.id)
    })

  return candidates.slice(0, count).map((building, index) => {
    const seed = seedForWorldCell(building.cellX, building.cellZ, missionIndex * 31 + index + 1)
    const useX = (seed & 1) === 0
    const direction = (seed & 2) === 0 ? 1 : -1
    return {
      building,
      position: {
        x: building.position.x + (useX ? direction * (building.size.x / 2 + 3.5) : (unit(seed, 6) - 0.5) * building.size.x * 0.5),
        y: 0.75,
        z: building.position.z + (!useX ? direction * (building.size.z / 2 + 3.5) : (unit(seed, 14) - 0.5) * building.size.z * 0.5),
      },
    }
  })
}

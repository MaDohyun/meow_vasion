import type { Vec3 } from './drone'
import {
  PARKED_CAR_COLORS,
  WORLD_CELL_SIZE,
  groundCellsAround,
  seedForWorldCell,
  type ProceduralBuilding,
  type ProceduralCar,
  type ProceduralCell,
} from './world'

export type GroundLandmark = 'park' | 'subway' | 'parking-lot' | 'power-pylon' | 'gas-station' | null
export type CrowdSpawnZone = { x: number; z: number; radius: number; kind: 'park' | 'parking-lot' }

/**
 * Deterministic landmark selection shared by simulation and rendering. The
 * landmark is derived from the cell coordinates, so it needs no save data and
 * returns exactly the same result after leaving and revisiting a district.
 */
export function groundLandmarkForCell(cell: ProceduralCell): GroundLandmark {
  const roll = seedForWorldCell(cell.cellX, cell.cellZ, 0x1a4d6a7) % 1000

  if (cell.kind === 'parked-car') return roll < 45 ? 'parking-lot' : null
  if (cell.kind !== 'empty') return null

  if (roll < 28) return 'power-pylon'
  // Gas stations give the tankers somewhere to have come from. Rare enough to
  // stay a landmark, common enough that the connection is legible.
  if (roll < 62) return 'gas-station'
  if (roll < 110) return 'subway'
  if (roll < 279) return 'park'
  return null
}

export function isConvenienceStore(building: ProceduralBuilding) {
  if (building.size.y > 11.5) return false
  return seedForWorldCell(building.cellX, building.cellZ, 0xc071e) % 100 < 42
}

/**
 * News towers: the only buildings that carry a broadcast screen.
 *
 * Deliberately rare. The screen was previously offered to more than half of
 * every building over forty units, which put eight of them in a single district
 * - at that rate it is street furniture, not a landmark. Tuned by counting
 * rather than guessing: this yields roughly three across the active world, so
 * about one falls inside the view at a time.
 */
export const NEWS_TOWER_MIN_HEIGHT = 44

export function isNewsTower(building: ProceduralBuilding) {
  if (building.size.y < NEWS_TOWER_MIN_HEIGHT) return false
  return seedForWorldCell(building.cellX, building.cellZ, 0x0f0a11) % 100 < 26
}

/** Bus stops are street furniture on an occupied building lot, never a lone
 * landmark in an otherwise empty cell. */
export function hasBusStop(building: ProceduralBuilding) {
  if (isConvenienceStore(building)) return false
  return seedForWorldCell(building.cellX, building.cellZ, 0xb0570) % 100 < 14
}

export function crowdSpawnZonesAround(position: Pick<Vec3, 'x' | 'z'>, radius = 6): CrowdSpawnZone[] {
  const zones: CrowdSpawnZone[] = []
  for (const cell of groundCellsAround(position, radius)) {
    const kind = groundLandmarkForCell(cell)
    if (kind !== 'park' && kind !== 'parking-lot') continue
    zones.push({
      x: (cell.cellX + 0.5) * WORLD_CELL_SIZE,
      z: (cell.cellZ + 0.5) * WORLD_CELL_SIZE,
      radius: kind === 'park' ? 10 : 8,
      kind,
    })
  }
  return zones
}

/**
 * Parking-lot cars are simulation objects, not decorative meshes. Each rare
 * lot contributes three deterministic extra cars in addition to the cell's
 * original parked car, so all of them can later be pulled and absorbed.
 */
export function parkingCarsAround(position: Pick<Vec3, 'x' | 'z'>, radius = 6): ProceduralCar[] {
  const cars: ProceduralCar[] = []
  const offsets = [[-6, -5], [0, -5], [6, -5]] as const
  for (const cell of groundCellsAround(position, radius)) {
    if (groundLandmarkForCell(cell) !== 'parking-lot') continue
    const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
    const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
    const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x9a4c)
    const yaw = seed % 2 === 0 ? 0 : Math.PI / 2
    const cosine = Math.cos(yaw)
    const sine = Math.sin(yaw)
    for (let index = 0; index < offsets.length; index += 1) {
      const [localX, localZ] = offsets[index]!
      cars.push({
        id: `parking-car:${cell.cellX}:${cell.cellZ}:${index}`,
        cellX: cell.cellX,
        cellZ: cell.cellZ,
        position: {
          x: centerX + localX * cosine + localZ * sine,
          y: 0.65,
          z: centerZ - localX * sine + localZ * cosine,
        },
        rotation: yaw,
        color: PARKED_CAR_COLORS[(seed + index) % PARKED_CAR_COLORS.length]!,
      })
    }
  }
  return cars
}

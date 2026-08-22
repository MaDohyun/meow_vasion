import type { Vec3 } from './drone'
import {
  buildingMass,
  getProceduralCell,
  lakeClusterForCell,
  mysteryCircleForCell,
  parkClusterForCell,
  PARKED_CAR_COLORS,
  WORLD_CELL_SIZE,
  groundCellsAround,
  seedForWorldCell,
  type ProceduralBuilding,
  type ProceduralCar,
  type ProceduralCell,
} from './world'

export type GroundLandmark = 'park' | 'subway' | 'parking-lot' | 'power-pylon' | 'gas-station' | 'communications' | 'lake' | 'mystery-circle' | null
export type CrowdSpawnZone = { x: number; z: number; radius: number; kind: 'park' | 'parking-lot' }
export type LakeShoreTree = { x: number; z: number; height: number; crown: number }

/**
 * Deterministic landmark selection shared by simulation and rendering. The
 * landmark is derived from the cell coordinates, so it needs no save data and
 * returns exactly the same result after leaving and revisiting a district.
 */
export function groundLandmarkForCell(cell: ProceduralCell): GroundLandmark {
  if (parkClusterForCell(cell.cellX, cell.cellZ)) return 'park'
  if (lakeClusterForCell(cell.cellX, cell.cellZ)) return 'lake'
  if (mysteryCircleForCell(cell.cellX, cell.cellZ)) return 'mystery-circle'
  const roll = seedForWorldCell(cell.cellX, cell.cellZ, 0x1a4d6a7) % 1000

  // Car parks were 45 in a thousand of the cells that already hold a parked
  // car, which worked out at well under one percent of the map - rare enough
  // that a whole run could pass without flying over one, and they are the
  // densest food in the city. Raised until they read as a district feature.
  if (cell.kind === 'parked-car') return roll < 180 ? 'parking-lot' : null
  if (cell.kind !== 'empty') return null

  if (roll < 28) return 'power-pylon'
  // Gas stations give the tankers somewhere to have come from. Rare enough to
  // stay a landmark, common enough that the connection is legible.
  if (roll < 62) return 'gas-station'
  if (roll < 92) return 'communications'
  if (roll < 140) return 'subway'
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

/**
 * Whether the beam can tear this building out of the ground.
 *
 * Building tiers use the same integer weight ladder as every other object.
 * The one-step margin is the deliberately slow `w = g + 1` lift band.
 */
export function canAbsorbBuilding(building: ProceduralBuilding, beamStrength: number) {
  // News towers stay standing. A city you can strip to nothing is a duller
  // one, and the broadcast screens are this game's voice.
  if (isNewsTower(building)) return false
  return buildingMass(building) <= beamStrength + 1
}

/** Screen height, in world units. */
export const NEWS_SCREEN_HEIGHT = 15

/**
 * How far the blank cladding runs past the screen, top and bottom.
 *
 * The screen is mounted on a band of solid wall rather than straight onto the
 * window grid - a screen over glass reads as a poster taped to a window, and
 * got worse once the facade started tiling by height. With no margin the screen
 * covers the band exactly and all the player sees is that the windows vanished;
 * the margin is what makes it read as a mounting.
 */
export const NEWS_SCREEN_MOUNT_MARGIN = 2.4

/**
 * Where the screen and its cladding sit on a tower, as a centre height and the
 * cladding's full height. Both have to stay inside the building: a band poking
 * through the roof or into the pavement is worse than the windows were.
 */
export function newsScreenMount(building: ProceduralBuilding) {
  return {
    centre: Math.max(12, building.size.y * 0.62),
    height: NEWS_SCREEN_HEIGHT + NEWS_SCREEN_MOUNT_MARGIN * 2,
  }
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
 * Small trees on the dry edge of a lake.
 *
 * Every candidate is inset well inside an empty neighbouring cell: the road
 * strip remains clear, water remains clear, and the result is deterministic
 * wherever the city streams back in.
 */
export function lakeShoreTreesAround(position: Pick<Vec3, 'x' | 'z'>, radius = 6): LakeShoreTree[] {
  const trees: LakeShoreTree[] = []
  const occupied = new Set<string>()
  const inset = 9.5
  const edges = [
    { x: -1, z: 0, side: 'west' },
    { x: 1, z: 0, side: 'east' },
    { x: 0, z: -1, side: 'south' },
    { x: 0, z: 1, side: 'north' },
  ] as const
  for (const cell of groundCellsAround(position, radius)) {
    if (!lakeClusterForCell(cell.cellX, cell.cellZ)) continue
    for (const [edgeIndex, edge] of edges.entries()) {
      const neighbourX = cell.cellX + edge.x
      const neighbourZ = cell.cellZ + edge.z
      if (lakeClusterForCell(neighbourX, neighbourZ)) continue
      const neighbour = getProceduralCell(neighbourX, neighbourZ)
      // Keep the shore vegetation on genuinely open ground. Landmark lots and
      // buildings already have their own authored dressing.
      if (neighbour.building || neighbour.car || groundLandmarkForCell(neighbour)) continue
      const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x1a6e700 + edgeIndex)
      if (seed % 100 >= 82) continue
      const centreX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
      const centreZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
      const jitter = ((seed >>> 11) % 101) / 100 * 10 - 5
      const x = edge.side === 'west'
        ? cell.cellX * WORLD_CELL_SIZE - inset
        : edge.side === 'east'
          ? (cell.cellX + 1) * WORLD_CELL_SIZE + inset
          : centreX + jitter
      const z = edge.side === 'south'
        ? cell.cellZ * WORLD_CELL_SIZE - inset
        : edge.side === 'north'
          ? (cell.cellZ + 1) * WORLD_CELL_SIZE + inset
          : centreZ + jitter
      const key = `${Math.round(x * 10)}:${Math.round(z * 10)}`
      if (occupied.has(key)) continue
      occupied.add(key)
      trees.push({
        x,
        z,
        height: 1.8 + ((seed >>> 19) % 8) * 0.11,
        crown: 1.45 + ((seed >>> 23) % 6) * 0.1,
      })
    }
  }
  return trees
}

/**
 * Parking-lot cars are simulation objects, not decorative meshes. Each rare
 * lot contributes three deterministic extra cars in addition to the cell's
 * original parked car, so all of them can later be pulled and absorbed.
 */
/**
 * Gas stations near a point, so tankers can be spawned where one plausibly
 * came from rather than materialising in the middle of a residential block.
 */
export function gasStationsAround(position: Pick<Vec3, 'x' | 'z'>, radius = 6) {
  const stations: { x: number; z: number }[] = []
  for (const cell of groundCellsAround(position, radius)) {
    if (groundLandmarkForCell(cell) !== 'gas-station') continue
    stations.push({ x: (cell.cellX + 0.5) * WORLD_CELL_SIZE, z: (cell.cellZ + 0.5) * WORLD_CELL_SIZE })
  }
  return stations
}

export type DestructibleLandmarkKind = 'gas-station' | 'communications'
export type DestructibleLandmark = {
  id: string
  kind: DestructibleLandmarkKind
  cellX: number
  cellZ: number
  position: Vec3
  radius: number
}

export function landmarkId(kind: DestructibleLandmarkKind, cellX: number, cellZ: number) {
  return `landmark:${kind}:${cellX}:${cellZ}`
}

export function destructibleLandmarksAround(position: Pick<Vec3, 'x' | 'z'>, radius = 9): DestructibleLandmark[] {
  const landmarks: DestructibleLandmark[] = []
  for (const cell of groundCellsAround(position, radius)) {
    const kind = groundLandmarkForCell(cell)
    if (kind !== 'gas-station' && kind !== 'communications') continue
    landmarks.push({
      id: landmarkId(kind, cell.cellX, cell.cellZ),
      kind,
      cellX: cell.cellX,
      cellZ: cell.cellZ,
      position: {
        x: (cell.cellX + 0.5) * WORLD_CELL_SIZE,
        y: kind === 'communications' ? 10 : 3,
        z: (cell.cellZ + 0.5) * WORLD_CELL_SIZE,
      },
      radius: kind === 'communications' ? 5 : 9,
    })
  }
  return landmarks
}

export function nearestDestructibleLandmark(
  position: Pick<Vec3, 'x' | 'z'>,
  kind: DestructibleLandmarkKind,
  removed?: ReadonlySet<string>,
) {
  return destructibleLandmarksAround(position, 20)
    .filter((landmark) => landmark.kind === kind && !removed?.has(landmark.id))
    .sort((left, right) =>
      Math.hypot(left.position.x - position.x, left.position.z - position.z) -
      Math.hypot(right.position.x - position.x, right.position.z - position.z),
    )[0] ?? null
}

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

import type { Vec3 } from './drone'
import {
  buildingMass,
  getProceduralCell,
  lakeClusterForCell,
  lakeWaterRect,
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
export type LakeShoreDecorKind = 'rock' | 'reed'
export type LakeShoreDecor = {
  x: number
  z: number
  kind: LakeShoreDecorKind
  /** Footprint radius in metres; reeds take their height from it as well. */
  size: number
  /** Yaw in radians, so no two neighbours present the same silhouette. */
  angle: number
}

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
  if (building.specialty) return false
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

/** Authored silhouettes and landmark storefronts keep their own identity. */
export function isSpecialBuilding(building: ProceduralBuilding) {
  return Boolean(
    building.specialty
    || building.largeFootprint
    || isConvenienceStore(building)
    || isNewsTower(building),
  )
}

/** Ordinary buildings receive neon deterministically, without saved state. */
export function hasBuildingNeonSign(building: ProceduralBuilding) {
  if (isSpecialBuilding(building)) return false
  return seedForWorldCell(building.cellX, building.cellZ, 0x4e30a) % 100 < 70
}

export type BuildingNeonSignLayout = 'horizontal' | 'vertical'

/** Signed ordinary buildings mix broad wordmarks with tall illustrated signs. */
export function buildingNeonSignLayout(building: ProceduralBuilding): BuildingNeonSignLayout | null {
  if (!hasBuildingNeonSign(building)) return null
  const seed = seedForWorldCell(building.cellX, building.cellZ, 0x4e30a)
  return (seed >>> 9) % 3 === 0 ? 'vertical' : 'horizontal'
}

/**
 * Whether the beam can tear this building out of the ground.
 *
 * Building tiers use the same integer weight ladder as every other object.
 * The one-step margin is the deliberately slow `w = g + 1` lift band.
 *
 * There are no exemptions left. The news tower used to be one - a city you
 * can strip to nothing is a duller one, and the broadcast screens are this
 * game's voice - but a screen that survives a craft the size of the block it
 * is bolted to says something worse than "duller": it says the rule is about
 * what a building *is* rather than what it weighs. Height charges the tower
 * for it instead. A news tower is at least forty-four units tall, so it is
 * always a ten or an eleven, which is the top of the city ladder and the last
 * thing a run opens. The bulletins are the HUD's own band and go on either
 * way; what a swallowed tower costs is the screen on the skyline.
 */
export function canAbsorbBuilding(building: ProceduralBuilding, beamStrength: number) {
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

export type BusStopAnchor = { x: number; z: number; onX: boolean; side: -1 | 1 }

/**
 * Where a building's bus shelter actually stands, or null when it cannot.
 *
 * The shelter goes a bench-length past one building face. A face close to the
 * road used to push the bench out onto the carriageway - straight through the
 * lamp and bin lines - so an anchor that cannot keep a pavement-interior
 * margin is dropped rather than clamped (clamping would shove the bench back
 * through its own building's wall). Placement and render share this anchor,
 * and other street furniture keeps clear of it.
 */
export function busStopAnchor(building: ProceduralBuilding): BusStopAnchor | null {
  if (!hasBusStop(building)) return null
  const onX = building.sign.side === 'x'
  const seed = seedForWorldCell(building.cellX, building.cellZ, 0xb0570)
  const side: -1 | 1 = seed % 2 === 0 ? -1 : 1
  const x = building.position.x + (onX ? side * (building.size.x / 2 + 3.5) : 0)
  const z = building.position.z + (!onX ? side * (building.size.z / 2 + 3.5) : 0)
  const margin = 6
  const localX = x - building.cellX * WORLD_CELL_SIZE
  const localZ = z - building.cellZ * WORLD_CELL_SIZE
  if (localX < margin || localX > WORLD_CELL_SIZE - margin) return null
  if (localZ < margin || localZ > WORLD_CELL_SIZE - margin) return null
  return { x, z, onX, side }
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
 * A small stand of trees on the dry edge of a lake.
 *
 * Every candidate is inset well inside an empty neighbouring cell: the road
 * that rings the lake stays clear, water stays clear, and the result is
 * deterministic wherever the city streams back in.
 *
 * A shore used to get one tree per edge, which - once the free-neighbour test
 * and the thinning roll had both had their say - left the average lake with
 * fewer than two trees on it and some with none at all. Two trees do not read
 * as a wooded bank; they read as two trees that happen to be near water. Each
 * edge now offers three staggered spots at three different depths, so a shore
 * that clears the tests gets a stand rather than a specimen.
 */
const SHORE_TREES_PER_EDGE = 3
/** Depth into the neighbouring cell per slot. All three clear the 4.5-wide
 *  road strip, and staggering them keeps the stand off a straight line. */
const SHORE_TREE_INSETS = [8.7, 12.6, 10.4] as const
/** Along-shore offset per slot from the middle of the edge. Bounded so the
 *  outermost tree still clears the neighbour's perpendicular road strips. */
const SHORE_TREE_SPREAD = 8.4

export function lakeShoreTreesAround(position: Pick<Vec3, 'x' | 'z'>, radius = 6): LakeShoreTree[] {
  const trees: LakeShoreTree[] = []
  const occupied = new Set<string>()
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
      for (let slot = 0; slot < SHORE_TREES_PER_EDGE; slot += 1) {
        const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x1a6e700 + edgeIndex * 8 + slot)
        // The middle tree is the one a shore is least likely to go without;
        // the pair flanking it thin out harder, so no two banks match.
        if (seed % 100 >= (slot === 0 ? 92 : 74)) continue
        const inset = SHORE_TREE_INSETS[slot]! + (((seed >>> 5) % 5) - 2) * 0.35
        const along = (slot === 0 ? 0 : slot === 1 ? -SHORE_TREE_SPREAD : SHORE_TREE_SPREAD)
          + (((seed >>> 11) % 101) / 100) * 4.6 - 2.3
        const centreX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
        const centreZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
        const x = edge.side === 'west'
          ? cell.cellX * WORLD_CELL_SIZE - inset
          : edge.side === 'east'
            ? (cell.cellX + 1) * WORLD_CELL_SIZE + inset
            : centreX + along
        const z = edge.side === 'south'
          ? cell.cellZ * WORLD_CELL_SIZE - inset
          : edge.side === 'north'
            ? (cell.cellZ + 1) * WORLD_CELL_SIZE + inset
            : centreZ + along
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
  }
  return trees
}

/**
 * Pebbles and reed clumps along a lake's waterline.
 *
 * The water tile is a rectangle, and a rectangle of blue reads as a municipal
 * pool rather than a lake however nicely it ripples. These break the straight
 * edge: each piece sits within a few metres of the waterline, some on the dry
 * lip and some standing in the shallows, so the outline the eye follows is
 * ragged even though the mesh underneath is still square.
 *
 * Decoration only - nothing here is a beam object. It never enters the
 * simulation, so it costs two instanced pools and no per-frame work beyond
 * the cell-key rebuild the other ground pools already do.
 */
export const LAKE_SHORE_DECOR_PER_EDGE = 9
/** Hard ceiling on one sweep, comfortably above the ~500 the densest lake
 *  district produces. Each instanced pool is sized to it in full, so a shore
 *  that comes out all rock or all reed still has a slot for every piece. */
export const LAKE_SHORE_DECOR_CAPACITY = 640
/** Metres of dry lip outside the waterline a piece may claim. Well short of
 *  the margin the water tile holds back, so none of it reaches the road. */
export const LAKE_SHORE_DECOR_DRY_LIP = 1.1
/** Metres into the shallows a piece may wade. */
export const LAKE_SHORE_DECOR_SHALLOWS = 3.4

export function lakeShoreDecorAround(position: Pick<Vec3, 'x' | 'z'>, radius = 6): LakeShoreDecor[] {
  const decor: LakeShoreDecor[] = []
  const occupied = new Set<string>()
  // A piece and its companion both have to land somewhere on the shore band,
  // and two shores meeting at a corner must not stack a rock on a reed.
  const place = (x: number, z: number, item: Omit<LakeShoreDecor, 'x' | 'z'>) => {
    const key = `${Math.round(x)}:${Math.round(z)}`
    if (occupied.has(key)) return
    occupied.add(key)
    decor.push({ ...item, x, z })
  }
  for (const cell of groundCellsAround(position, radius)) {
    const rect = lakeWaterRect(cell.cellX, cell.cellZ)
    if (!rect) continue
    const sides = [
      { open: rect.westOpen, axis: 'x' as const, edge: rect.minX, inward: 1 },
      { open: rect.eastOpen, axis: 'x' as const, edge: rect.maxX, inward: -1 },
      { open: rect.southOpen, axis: 'z' as const, edge: rect.minZ, inward: 1 },
      { open: rect.northOpen, axis: 'z' as const, edge: rect.maxZ, inward: -1 },
    ]
    for (const [sideIndex, side] of sides.entries()) {
      // An internal seam of a multi-cell lake is open water, not a shore.
      if (!side.open) continue
      const alongMin = side.axis === 'x' ? rect.minZ : rect.minX
      const alongMax = side.axis === 'x' ? rect.maxZ : rect.maxX
      const spacing = (alongMax - alongMin) / LAKE_SHORE_DECOR_PER_EDGE
      for (let index = 0; index < LAKE_SHORE_DECOR_PER_EDGE; index += 1) {
        const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x1a6ed00 + sideIndex * 32 + index)
        // A shore is not a fence: a fifth of the slots stay bare.
        if (seed % 100 < 18) continue
        const slot = (index + 0.5) / LAKE_SHORE_DECOR_PER_EDGE
        // Nearly a full slot of drift, so the row of anchors underneath never
        // shows through as evenly spaced dressing.
        const along = alongMin
          + slot * (alongMax - alongMin)
          + ((((seed >>> 7) % 101) / 100) - 0.5) * spacing * 0.95
        // Measured from the waterline: negative is the dry lip outside it,
        // positive is standing in the shallows.
        const depth = -LAKE_SHORE_DECOR_DRY_LIP
          + (((seed >>> 13) % 101) / 100) * (LAKE_SHORE_DECOR_DRY_LIP + LAKE_SHORE_DECOR_SHALLOWS)
        const kind: LakeShoreDecorKind = ((seed >>> 21) % 100) < 46 ? 'rock' : 'reed'
        const size = kind === 'rock'
          ? 0.85 + ((seed >>> 25) % 7) * 0.16
          : 0.9 + ((seed >>> 25) % 7) * 0.13
        const angle = (((seed >>> 3) % 360) / 180) * Math.PI
        const offset = side.edge + side.inward * depth
        place(
          side.axis === 'x' ? offset : along,
          side.axis === 'x' ? along : offset,
          { kind, size, angle },
        )
        // Boulders and reeds both come in clumps. One evenly spaced piece per
        // slot reads as a row of bollards however much the anchor is jittered;
        // a companion half its size beside it reads as a shore.
        if ((seed >>> 17) % 100 >= 44) continue
        const companionAlong = along + (((seed >>> 11) % 2 === 0) ? -1 : 1) * (0.75 + size * 0.5)
        if (companionAlong < alongMin || companionAlong > alongMax) continue
        const companionDepth = Math.max(
          -LAKE_SHORE_DECOR_DRY_LIP,
          Math.min(LAKE_SHORE_DECOR_SHALLOWS, depth + 0.6 + ((seed >>> 29) % 4) * 0.35),
        )
        const companionOffset = side.edge + side.inward * companionDepth
        place(
          side.axis === 'x' ? companionOffset : companionAlong,
          side.axis === 'x' ? companionAlong : companionOffset,
          { kind, size: size * 0.62, angle: angle + 1.1 },
        )
      }
    }
    if (decor.length >= LAKE_SHORE_DECOR_CAPACITY) return decor.slice(0, LAKE_SHORE_DECOR_CAPACITY)
  }
  return decor
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

/**
 * The forecourt's rung on the weight ladder - heavier than a pylon, lighter
 * than a comms mast.
 *
 * It began as the price of a demolition: touching a station used to detonate
 * it, so the cone brushing past was the whole test and the feeblest beam in
 * the game blew one up by flying over. Weight fixed the graze but kept the
 * blast, because a station had no lifted model to carry off.
 *
 * It has one now, so this is what it says it is: the weight of a filling
 * station. A beam strong enough tears the whole forecourt up - canopy, pumps
 * and shop together - and carries or eats it like any other prop, and blowing
 * one up is the laser's business, exactly as with the tanker parked on it.
 *
 * Read through `WORLD_PROP_MASS['gas-station']` by the beam and kept here
 * because the laser knows the same object as a landmark.
 */
export const GAS_STATION_BEAM_MASS = 9

/**
 * Laser damage a rare landmark soaks before it goes up.
 *
 * One shot used to be the whole judgement, which made the two most
 * spectacular demolitions in the game also the cheapest. Two base hits means
 * the first shot is a visible commitment - the landmark flashes and stands -
 * and a fully boosted laser (x2.0) earns the one-shot back as a reward.
 */
export const LANDMARK_LASER_HITS = 2

/** Same accumulator shape as damageBuilding, keyed by landmark id. */
export function damageLandmark(health: Map<string, number>, id: string, damage: number) {
  const before = health.get(id) ?? LANDMARK_LASER_HITS
  const after = Math.max(0, before - Math.max(0, damage))
  health.set(id, after)
  return { hit: damage > 0, destroyed: after <= 0, health: after }
}

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
        y: kind === 'communications' ? 29 : 3,
        z: (cell.cellZ + 0.5) * WORLD_CELL_SIZE,
      },
      radius: kind === 'communications' ? 8 : 9,
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

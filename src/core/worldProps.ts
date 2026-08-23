import type { Vec3 } from './drone'
import type { BeamObject, BeamWorldProp } from './beam'
import {
  busStopAnchor,
  groundLandmarkForCell,
  lakeShoreTreesAround,
  landmarkId,
} from './cityLandmarks'
import {
  BUILDING_PODIUM_SPREAD,
  getProceduralCell,
  groundCellsAround,
  lakeClusterForCell,
  parkClusterForCell,
  seedForWorldCell,
  WORLD_CELL_SIZE,
  type ActiveWorld,
  type ProceduralCell,
} from './world'

/** Integer beam weights for city dressing that is independent of its host lot. */
export const WORLD_PROP_MASS = {
  'rooftop-structure': 5,
  tree: 3,
  'utility-pole': 3,
  'power-pylon': 6,
  communications: 11,
  'trash-bin': 2,
  'park-bench': 3,
  'bus-stop': 5,
} as const

export function worldPropMass(worldProp: Pick<BeamWorldProp, 'kind'>) {
  return WORLD_PROP_MASS[worldProp.kind]
}

export const ROOF_STRUCTURE_MIN_HEIGHT = 10
export const LANDMARK_RADIUS_CELLS = 6
export const LANDMARK_CELL_COUNT = (LANDMARK_RADIUS_CELLS * 2 + 1) ** 2
export const STREETLIGHT_RADIUS_CELLS = 5
export const PARK_TREE_COUNT = 3
export const LAKE_SHORE_TREE_CAPACITY = LANDMARK_CELL_COUNT * 2
export const TREE_VARIANT_ROUND = 0
export const TREE_VARIANT_SLENDER = 1

/** One deterministic bit chooses the tree silhouette at each spawn point. */
function treeVariant(seed: number) {
  return seed % 2 === 0 ? TREE_VARIANT_ROUND : TREE_VARIANT_SLENDER
}

function prop(
  value: Omit<BeamWorldProp, 'position' | 'scale'> & { position: Vec3; scale?: Vec3 },
): BeamWorldProp {
  return {
    ...value,
    scale: value.scale ?? { x: 1, y: 1, z: 1 },
  }
}

/** Crown-to-crown clearance between two trees sharing a park cell. */
export const PARK_TREE_SPACING = 4.4
/** Clearance a tree keeps from the cell's bench so neither grows through it. */
export const PARK_BENCH_CLEARANCE = 3.4
const PARK_TREE_PLACEMENT_TRIES = 8

/** The park tree transforms are shared by the simulation and its instanced render pool. */
export function parkTreesAround(position: Pick<Vec3, 'x' | 'z'>, radius = LANDMARK_RADIUS_CELLS) {
  const trees: Array<BeamWorldProp & { height: number; crown: number }> = []
  for (const cell of groundCellsAround(position, radius)) {
    if (groundLandmarkForCell(cell) !== 'park') continue
    const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
    const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
    const benchZ = centerZ + PARK_BENCH_OFFSET_Z
    const placed: { x: number; z: number }[] = []
    for (let tree = 0; tree < PARK_TREE_COUNT; tree += 1) {
      const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x7ee00 + tree)
      const height = 2.7 + ((seed >>> 19) % 8) * 0.12
      const crown = 2.2 + ((seed >>> 23) % 5) * 0.16
      // Three independent angles around one small ring used to drop trees on
      // top of each other, and on the bench sitting at a fixed offset - which
      // looked like a single tree spawning twice. Walk deterministic
      // alternatives until one clears both.
      let spot = { x: centerX, z: centerZ }
      for (let attempt = 0; attempt < PARK_TREE_PLACEMENT_TRIES; attempt += 1) {
        const roll = attempt === 0 ? seed : seedForWorldCell(cell.cellX, cell.cellZ, 0x7ee00 + tree + attempt * 0x40)
        const angle = (roll % 1000) / 1000 * Math.PI * 2
        const ring = 4.5 + ((roll >>> 12) % 55) / 10
        spot = { x: centerX + Math.cos(angle) * ring, z: centerZ + Math.sin(angle) * ring }
        const clearOfBench = Math.hypot(spot.x - centerX, spot.z - benchZ) >= PARK_BENCH_CLEARANCE
        const clearOfTrees = placed.every((other) => Math.hypot(spot.x - other.x, spot.z - other.z) >= PARK_TREE_SPACING)
        if (clearOfBench && clearOfTrees) break
      }
      placed.push(spot)
      trees.push({
        ...prop({
        id: `tree:park:${cell.cellX}:${cell.cellZ}:${tree}`,
        kind: 'tree',
        position: { x: spot.x, y: 0, z: spot.z },
        rotation: 0,
        // A spawn point owns exactly one silhouette. Previously the static
        // round crown and the lifted proxy were both rendered here, which
        // looked like two trees occupying the same coordinates.
        variant: treeVariant(seed),
        }),
        height,
        crown,
      })
    }
  }
  return trees
}

/** Where the bench sits relative to its park cell centre; trees route around it. */
export const PARK_BENCH_OFFSET_Z = 3.5

/** One deterministic, beam-capable bench for every generated park cell. */
export function parkBenchesAround(position: Pick<Vec3, 'x' | 'z'>, radius = LANDMARK_RADIUS_CELLS) {
  const benches: BeamWorldProp[] = []
  for (const cell of groundCellsAround(position, radius)) {
    if (groundLandmarkForCell(cell) !== 'park') continue
    const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0xbec44)
    benches.push(prop({
      id: `park-bench:${cell.cellX}:${cell.cellZ}`,
      kind: 'park-bench',
      position: {
        x: (cell.cellX + 0.5) * WORLD_CELL_SIZE,
        y: 0,
        z: (cell.cellZ + 0.5) * WORLD_CELL_SIZE + PARK_BENCH_OFFSET_Z,
      },
      rotation: (seed % 4) * Math.PI / 2,
      variant: 0,
    }))
  }
  return benches
}

/** Building-attached bus shelters shared by simulation and render pools. */
export function busStopsAround(world: ActiveWorld) {
  const stops: BeamWorldProp[] = []
  for (const building of world.buildings) {
    const anchor = busStopAnchor(building)
    if (!anchor) continue
    stops.push(prop({
      id: `bus-stop:${building.id}`,
      kind: 'bus-stop',
      position: { x: anchor.x, y: 0, z: anchor.z },
      rotation: anchor.onX ? Math.PI / 2 : 0,
      scale: { x: 0.82, y: 0.82, z: 0.82 },
      // Keep the side bit so the separate static route sign follows the same
      // deterministic side of the shelter as before.
      variant: anchor.side > 0 ? 1 : 0,
    }))
  }
  return stops
}

/**
 * Street furniture must not stand inside anything else on the lot.
 *
 * The building test uses the rendered ground footprint, not the tower's: a
 * podium base draws wider than building.size, and a lamp placed against the
 * tower used to end up buried in - and poking out the top of - the low slab.
 * The bus shelter and the lot's parked car are the other fixed occupants.
 */
function kerbSpotIsClear(cell: ProceduralCell, x: number, z: number, margin: number) {
  const building = cell.building
  if (building) {
    const bulge = building.form === 'podium' ? BUILDING_PODIUM_SPREAD : 1
    const halfX = (building.size.x / 2) * bulge + margin
    const halfZ = (building.size.z / 2) * bulge + margin
    if (
      x > building.position.x - halfX && x < building.position.x + halfX
      && z > building.position.z - halfZ && z < building.position.z + halfZ
    ) return false
    const stop = busStopAnchor(building)
    if (stop && Math.hypot(x - stop.x, z - stop.z) < 4.2) return false
  }
  if (cell.car && Math.hypot(x - cell.car.position.x, z - cell.car.position.z) < 3.4) return false
  return true
}

/** The kerbside lamp spots a cell rolled, shared so bins can avoid them. */
function lampSpotsForCell(cellX: number, cellZ: number) {
  const spots: { x: number; z: number; rotation: number; spotIndex: number }[] = []
  const candidates = [
    { x: cellX * WORLD_CELL_SIZE + 4.6, z: (cellZ + 0.5) * WORLD_CELL_SIZE, rotation: -Math.PI / 2 },
    { x: (cellX + 0.5) * WORLD_CELL_SIZE, z: cellZ * WORLD_CELL_SIZE + 4.6, rotation: Math.PI },
  ]
  for (const [spotIndex, candidate] of candidates.entries()) {
    if (seedForWorldCell(cellX, cellZ, 0x51a9 + spotIndex) % 3 !== 0) continue
    spots.push({ ...candidate, spotIndex })
  }
  return spots
}

/** Street lamps are treated as utility poles for the beam, with the same stable thinning as the render pool. */
export function utilityPolesAround(position: Pick<Vec3, 'x' | 'z'>, radius = STREETLIGHT_RADIUS_CELLS) {
  const poles: BeamWorldProp[] = []
  const centreX = Math.floor(position.x / WORLD_CELL_SIZE)
  const centreZ = Math.floor(position.z / WORLD_CELL_SIZE)
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const cellX = centreX + dx
      const cellZ = centreZ + dz
      if (parkClusterForCell(cellX, cellZ) || lakeClusterForCell(cellX, cellZ)) continue
      const cell = getProceduralCell(cellX, cellZ)
      for (const spot of lampSpotsForCell(cellX, cellZ)) {
        if (!kerbSpotIsClear(cell, spot.x, spot.z, 1)) continue
        poles.push(prop({
          id: `utility-pole:${cellX}:${cellZ}:${spot.spotIndex}`,
          kind: 'utility-pole',
          position: { x: spot.x, y: 0, z: spot.z },
          rotation: spot.rotation,
          variant: spot.spotIndex,
        }))
      }
    }
  }
  return poles
}

/**
 * Sorting-station bin pairs, tucked against the building line.
 *
 * Same deterministic per-cell roll as the street lamps, but deliberately
 * rarer, and set deeper off the carriageway than the lamp line so a bin sits
 * beside the buildings at the back of the pavement rather than in anyone's
 * way. The along-edge offset comes from the seed too, so bins land at varied
 * points down a block instead of always at the same spot per cell.
 */
export function trashBinsAround(position: Pick<Vec3, 'x' | 'z'>, radius = STREETLIGHT_RADIUS_CELLS) {
  const bins: BeamWorldProp[] = []
  const centreX = Math.floor(position.x / WORLD_CELL_SIZE)
  const centreZ = Math.floor(position.z / WORLD_CELL_SIZE)
  const inset = 6.4
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const cellX = centreX + dx
      const cellZ = centreZ + dz
      if (parkClusterForCell(cellX, cellZ) || lakeClusterForCell(cellX, cellZ)) continue
      const cell = getProceduralCell(cellX, cellZ)
      // Landmark yards (car parks, gas stations, pylons...) carry their own
      // authored dressing; a bin standing in a painted parking bay reads as a
      // glitch rather than street furniture.
      if (groundLandmarkForCell(cell)) continue
      const lampSpots = lampSpotsForCell(cellX, cellZ)
      for (let spotIndex = 0; spotIndex < 2; spotIndex += 1) {
        const seed = seedForWorldCell(cellX, cellZ, 0x7b1a5 + spotIndex)
        if (seed % 7 !== 0) continue
        const along = 6 + ((seed >>> 9) % 22)
        // Spot 0 stands along the cell's west edge facing east into the road;
        // spot 1 along the south edge facing north. Both sit behind the lamp
        // line (4.6), against the building fronts.
        const [x, z, rotation] = spotIndex === 0
          ? [cellX * WORLD_CELL_SIZE + inset, cellZ * WORLD_CELL_SIZE + along, -Math.PI / 2]
          : [cellX * WORLD_CELL_SIZE + along, cellZ * WORLD_CELL_SIZE + inset, Math.PI]
        if (!kerbSpotIsClear(cell, x, z, 0.8)) continue
        if (lampSpots.some((lamp) => Math.hypot(x - lamp.x, z - lamp.z) < 2.6)) continue
        bins.push(prop({
          id: `trash-bin:${cellX}:${cellZ}:${spotIndex}`,
          kind: 'trash-bin',
          position: { x, y: 0, z },
          rotation,
          variant: spotIndex,
        }))
      }
    }
  }
  return bins
}

/** All beam-capable dressing in the active district. */
export function worldPropsAround(world: ActiveWorld, position: Pick<Vec3, 'x' | 'z'>) {
  const props: BeamWorldProp[] = []
  for (const building of world.buildings) {
    if (building.size.y < ROOF_STRUCTURE_MIN_HEIGHT) continue
    const seed = seedForWorldCell(building.cellX, building.cellZ, 0x700f7)
    const fit = Math.min(1, Math.min(building.size.x, building.size.z) / 9)
    const scale = 0.55 + fit * 0.55
    props.push(prop({
      id: `roof:${building.id}`,
      kind: 'rooftop-structure',
      buildingId: building.id,
      position: {
        x: building.position.x,
        y: building.size.y + building.roofThickness + 0.32,
        z: building.position.z,
      },
      rotation: (seed >>> 5) % 4 * Math.PI / 2,
      variant: seed % 4,
      scale: { x: scale, y: scale, z: scale },
    }))
  }
  props.push(...parkTreesAround(position))
  props.push(...parkBenchesAround(position))
  for (const [index, tree] of lakeShoreTreesAround(position, LANDMARK_RADIUS_CELLS).entries()) {
    props.push(prop({
      id: `tree:lake:${Math.round(tree.x * 10)}:${Math.round(tree.z * 10)}:${index}`,
      kind: 'tree',
      position: { x: tree.x, y: 0, z: tree.z },
      rotation: 0,
      variant: treeVariant(seedForWorldCell(
        Math.round(tree.x * 10),
        Math.round(tree.z * 10),
        0x7ee00,
      )),
      height: tree.height,
      crown: tree.crown,
    }))
  }
  props.push(...utilityPolesAround(position))
  props.push(...trashBinsAround(position))
  props.push(...busStopsAround(world))
  for (const cell of groundCellsAround(position, LANDMARK_RADIUS_CELLS)) {
    const landmark = groundLandmarkForCell(cell)
    const center = { x: (cell.cellX + 0.5) * WORLD_CELL_SIZE, y: 0, z: (cell.cellZ + 0.5) * WORLD_CELL_SIZE }
    const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x7a4517)
    if (landmark === 'power-pylon') {
      props.push(prop({ id: `power-pylon:${cell.cellX}:${cell.cellZ}`, kind: 'power-pylon', position: center, rotation: (seed % 4) * Math.PI / 2, variant: 0 }))
    } else if (landmark === 'communications') {
      props.push(prop({ id: landmarkId('communications', cell.cellX, cell.cellZ), kind: 'communications', position: center, rotation: (seed % 4) * Math.PI / 2, variant: 0 }))
    }
  }
  return props
}

/** How far a prop has to be off its spot before the world stops drawing it
 *  there. Wide enough to swallow float noise, tight enough that any real
 *  movement counts. */
export const WORLD_PROP_SETTLE_EPSILON = 0.2

/**
 * Static pools draw a prop only where the world put it.
 *
 * The test is displacement, not grip. A prop's beam object carries its own
 * spawn transform on `worldProp`, and the static instanced pools draw from the
 * same deterministic list, so the moment the live object is anywhere else the
 * static copy is a second, wrong copy of it and has to go.
 *
 * Two bugs came out of asking a narrower question:
 *
 * - `inBeam` goes true the instant the cone touches a prop, whether or not the
 *   craft can lift it (see beamLiftScale in core/beam.ts) - and a tree or a
 *   bus stop outweighs an early craft for most of a run. That swapped a
 *   standing prop onto the lifted pool just for being grazed, which read as it
 *   darkening or spawning twice every time the player flew past.
 * - `tether` is the opposite mistake: it decays within about a third of a
 *   second of releasing the beam. A tree dropped in mid-air handed itself back
 *   to the static pool while it was still falling, so it appeared to snap home
 *   to the spot it was picked up from, while the object nobody could see any
 *   more went on falling. Cars and pedestrians never did this because nothing
 *   draws them from a fixed list - only city dressing has a home to snap to.
 *
 * Displacement covers both, and covers the cases neither did: a prop flung by
 * a nearby explosion is off its spot without ever having been in the beam.
 */
export function isWorldPropDisplaced(
  object: Pick<BeamObject, 'active' | 'absorbing' | 'position' | 'worldProp'>,
) {
  if (!object.active) return false
  if (object.absorbing) return true
  const home = object.worldProp?.position
  if (!home) return false
  return Math.abs(object.position.x - home.x) > WORLD_PROP_SETTLE_EPSILON
    || Math.abs(object.position.y - home.y) > WORLD_PROP_SETTLE_EPSILON
    || Math.abs(object.position.z - home.z) > WORLD_PROP_SETTLE_EPSILON
}

export function isWorldPropHidden(
  id: string,
  destroyed: ReadonlySet<string>,
  objects: ReadonlyArray<Pick<BeamObject, 'id' | 'active' | 'absorbing' | 'position' | 'worldProp'>>,
) {
  if (destroyed.has(id)) return true
  return objects.some((object) => object.id === id && isWorldPropDisplaced(object))
}

export function worldPropVisibilityKey(
  destroyed: ReadonlySet<string>,
  objects: ReadonlyArray<Pick<BeamObject, 'id' | 'active' | 'absorbing' | 'position' | 'worldProp'>>,
) {
  const hidden = objects
    .filter(isWorldPropDisplaced)
    .map((object) => object.id)
    .sort()
  return `${[...destroyed].sort().join(',')}|${hidden.join(',')}`
}

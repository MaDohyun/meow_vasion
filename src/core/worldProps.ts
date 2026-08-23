import type { Vec3 } from './drone'
import type { BeamObject, BeamWorldProp } from './beam'
import {
  groundLandmarkForCell,
  lakeShoreTreesAround,
  landmarkId,
} from './cityLandmarks'
import {
  groundCellsAround,
  lakeClusterForCell,
  parkClusterForCell,
  seedForWorldCell,
  WORLD_CELL_SIZE,
  type ActiveWorld,
} from './world'

/** Integer beam weights for city dressing that is independent of its host lot. */
export const WORLD_PROP_MASS = {
  'rooftop-structure': 5,
  tree: 4,
  'utility-pole': 3,
  'power-pylon': 6,
  communications: 11,
} as const

export const ROOF_STRUCTURE_MIN_HEIGHT = 10
export const LANDMARK_RADIUS_CELLS = 6
export const LANDMARK_CELL_COUNT = (LANDMARK_RADIUS_CELLS * 2 + 1) ** 2
export const STREETLIGHT_RADIUS_CELLS = 5
export const PARK_TREE_COUNT = 3
export const LAKE_SHORE_TREE_CAPACITY = LANDMARK_CELL_COUNT * 2

function prop(
  value: Omit<BeamWorldProp, 'position' | 'scale'> & { position: Vec3; scale?: Vec3 },
): BeamWorldProp {
  return {
    ...value,
    scale: value.scale ?? { x: 1, y: 1, z: 1 },
  }
}

/** The park tree transforms are shared by the simulation and its instanced render pool. */
export function parkTreesAround(position: Pick<Vec3, 'x' | 'z'>, radius = LANDMARK_RADIUS_CELLS) {
  const trees: Array<BeamWorldProp & { height: number; crown: number }> = []
  for (const cell of groundCellsAround(position, radius)) {
    if (groundLandmarkForCell(cell) !== 'park') continue
    const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
    const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
    for (let tree = 0; tree < PARK_TREE_COUNT; tree += 1) {
      const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x7ee00 + tree)
      const angle = (seed % 1000) / 1000 * Math.PI * 2
      const radius = 4.5 + ((seed >>> 12) % 55) / 10
      const height = 2.7 + ((seed >>> 19) % 8) * 0.12
      const crown = 2.2 + ((seed >>> 23) % 5) * 0.16
      trees.push({
        ...prop({
        id: `tree:park:${cell.cellX}:${cell.cellZ}:${tree}`,
        kind: 'tree',
        position: { x: centerX + Math.cos(angle) * radius, y: 0, z: centerZ + Math.sin(angle) * radius },
        rotation: 0,
        variant: tree,
        }),
        height,
        crown,
      })
    }
  }
  return trees
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
      const spots: [number, number, number][] = [
        [cellX * WORLD_CELL_SIZE + 4.6, (cellZ + 0.5) * WORLD_CELL_SIZE, -Math.PI / 2],
        [(cellX + 0.5) * WORLD_CELL_SIZE, cellZ * WORLD_CELL_SIZE + 4.6, Math.PI],
      ]
      for (const [spotIndex, [x, z, rotation]] of spots.entries()) {
        if (seedForWorldCell(cellX, cellZ, 0x51a9 + spotIndex) % 3 !== 0) continue
        poles.push(prop({
          id: `utility-pole:${cellX}:${cellZ}:${spotIndex}`,
          kind: 'utility-pole',
          position: { x, y: 0, z },
          rotation,
          variant: spotIndex,
        }))
      }
    }
  }
  return poles
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
  for (const [index, tree] of lakeShoreTreesAround(position, LANDMARK_RADIUS_CELLS).entries()) {
    props.push(prop({
      id: `tree:lake:${Math.round(tree.x * 10)}:${Math.round(tree.z * 10)}:${index}`,
      kind: 'tree',
      position: { x: tree.x, y: 0, z: tree.z },
      rotation: 0,
      variant: index,
      height: tree.height,
      crown: tree.crown,
    }))
  }
  props.push(...utilityPolesAround(position))
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

/** Static pools hide a prop while it is carried, and permanently after absorption. */
export function isWorldPropHidden(
  id: string,
  destroyed: ReadonlySet<string>,
  objects: ReadonlyArray<Pick<BeamObject, 'id' | 'active' | 'inBeam' | 'tether' | 'absorbing'>>,
) {
  if (destroyed.has(id)) return true
  return objects.some((object) => object.id === id && object.active && (object.inBeam || object.tether > 0.02 || object.absorbing))
}

export function worldPropVisibilityKey(
  destroyed: ReadonlySet<string>,
  objects: ReadonlyArray<Pick<BeamObject, 'id' | 'active' | 'inBeam' | 'tether' | 'absorbing'>>,
) {
  const hidden = objects
    .filter((object) => object.active && (object.inBeam || object.tether > 0.02 || object.absorbing))
    .map((object) => object.id)
    .sort()
  return `${[...destroyed].sort().join(',')}|${hidden.join(',')}`
}

import { collideDrone, type Aabb, type CollisionResult, type DroneState, type Vec3 } from './drone'

export type TileCoord = { x: number; y: number }
export type WorldOffset = { x: number; z: number }

export function wrapCoord(value: number, size: number) {
  if (size <= 0) throw new Error('wrap size must be positive')
  return ((value % size) + size) % size
}

export function getTileIndex(coord: TileCoord, width: number, height: number) {
  const x = wrapCoord(coord.x, width)
  const y = wrapCoord(coord.y, height)
  return y * width + x
}

export function getNeighbor(coord: TileCoord, direction: TileCoord, width: number, height: number): TileCoord {
  return {
    x: wrapCoord(coord.x + direction.x, width),
    y: wrapCoord(coord.y + direction.y, height),
  }
}

export function wrapCentered(value: number, size: number) {
  return wrapCoord(value + size / 2, size) - size / 2
}

export function wrappedDelta(from: number, to: number, size: number) {
  return wrapCentered(to - from, size)
}

export function wrappedDistance(from: number, to: number, size: number) {
  return Math.abs(wrappedDelta(from, to, size))
}

export function wrappedHorizontalDistance(from: Vec3, to: Vec3, size: number) {
  return Math.hypot(wrappedDelta(from.x, to.x, size), wrappedDelta(from.z, to.z, size))
}

export function nearestWrappedValue(value: number, reference: number, size: number) {
  return reference + wrappedDelta(reference, value, size)
}

export function worldTile(value: number, size: number) {
  return Math.floor((value + size / 2) / size)
}

export function renderOffsetsAround(position: Pick<Vec3, 'x' | 'z'>, size: number): WorldOffset[] {
  const centerX = worldTile(position.x, size) * size
  const centerZ = worldTile(position.z, size) * size
  const offsets: WorldOffset[] = []
  for (let z = -1; z <= 1; z += 1) {
    for (let x = -1; x <= 1; x += 1) offsets.push({ x: centerX + x * size, z: centerZ + z * size })
  }
  return offsets
}

export function collideDroneWrapped(state: DroneState, colliders: Aabb[], size: number): CollisionResult {
  const canonical: DroneState = structuredClone(state)
  canonical.position.x = wrapCentered(state.position.x, size)
  canonical.position.z = wrapCentered(state.position.z, size)
  const offsetX = state.position.x - canonical.position.x
  const offsetZ = state.position.z - canonical.position.z
  const result = collideDrone(canonical, colliders)
  result.state.position.x += offsetX
  result.state.position.z += offsetZ
  return result
}

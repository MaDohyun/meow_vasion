export const SKYLINE_CELL_SIZE = 26
export const SKYLINE_RADIUS = 300
export const SKYLINE_MAX_BLOCKS = 72

export type SkylineBlock = {
  id: string
  cellX: number
  cellZ: number
  x: number
  z: number
  width: number
  depth: number
  height: number
  colorIndex: number
}

export function seedForSkylineCell(cellX: number, cellZ: number) {
  let seed = Math.imul(cellX, 73856093) ^ Math.imul(cellZ, 19349663)
  seed ^= seed >>> 13
  seed = Math.imul(seed, 1274126177)
  return seed >>> 0
}

export function skylineCellKey(x: number, z: number) {
  const cellX = Math.floor(x / SKYLINE_CELL_SIZE)
  const cellZ = Math.floor(z / SKYLINE_CELL_SIZE)
  return { cellX, cellZ, key: `${cellX}:${cellZ}` }
}

export function generateSkylineBlocks(
  playerX: number,
  playerZ: number,
  limit = SKYLINE_MAX_BLOCKS,
): SkylineBlock[] {
  const centerX = Math.floor(playerX / SKYLINE_CELL_SIZE)
  const centerZ = Math.floor(playerZ / SKYLINE_CELL_SIZE)
  const centerWorldX = (centerX + 0.5) * SKYLINE_CELL_SIZE
  const centerWorldZ = (centerZ + 0.5) * SKYLINE_CELL_SIZE
  const count = Math.max(0, Math.min(SKYLINE_MAX_BLOCKS, limit))

  return Array.from({ length: count }, (_, slot) => {
    const seed = seedForSkylineCell(centerX * 97 + slot, centerZ * 89 - slot)
    const baseAngle = slot / Math.max(1, count) * Math.PI * 2
    const angularJitter = (((seed >>> 4) & 0xff) / 255 - 0.5) * Math.PI / Math.max(12, count)
    const angle = baseAngle + angularJitter
    const radius = SKYLINE_RADIUS + ((seed >>> 12) % 17) - 8
    const x = centerWorldX + Math.sin(angle) * radius
    const z = centerWorldZ + Math.cos(angle) * radius
    return {
      id: `${centerX}:${centerZ}:${slot}`,
      cellX: Math.floor(x / SKYLINE_CELL_SIZE),
      cellZ: Math.floor(z / SKYLINE_CELL_SIZE),
      x,
      z,
      width: 14 + (seed & 7) * 1.35,
      depth: 13 + ((seed >>> 3) & 7) * 1.2,
      height: 22 + ((seed >>> 7) % 49),
      colorIndex: (seed >>> 15) % 5,
    }
  })
}

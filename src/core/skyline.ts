export const SKYLINE_CELL_SIZE = 55
export const SKYLINE_MIN_RADIUS = 280
export const SKYLINE_MAX_RADIUS = 340
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

const cellCenter = (cell: number) => (cell + 0.5) * SKYLINE_CELL_SIZE

function blockForCell(cellX: number, cellZ: number): SkylineBlock | null {
  const seed = seedForSkylineCell(cellX, cellZ)
  if (seed % 100 >= 90) return null
  const jitterX = ((seed >>> 8) & 0xff) / 255 - 0.5
  const jitterZ = ((seed >>> 16) & 0xff) / 255 - 0.5
  return {
    id: `${cellX}:${cellZ}`,
    cellX,
    cellZ,
    x: cellCenter(cellX) + jitterX * 14,
    z: cellCenter(cellZ) + jitterZ * 14,
    width: 22 + (seed & 7) * 2.1,
    depth: 20 + ((seed >>> 3) & 7) * 1.9,
    height: 24 + ((seed >>> 21) % 57),
    colorIndex: (seed >>> 27) % 5,
  }
}

export function generateSkylineBlocks(
  playerX: number,
  playerZ: number,
  limit = SKYLINE_MAX_BLOCKS,
): SkylineBlock[] {
  const minCellX = Math.floor((playerX - SKYLINE_MAX_RADIUS) / SKYLINE_CELL_SIZE) - 1
  const maxCellX = Math.floor((playerX + SKYLINE_MAX_RADIUS) / SKYLINE_CELL_SIZE) + 1
  const minCellZ = Math.floor((playerZ - SKYLINE_MAX_RADIUS) / SKYLINE_CELL_SIZE) - 1
  const maxCellZ = Math.floor((playerZ + SKYLINE_MAX_RADIUS) / SKYLINE_CELL_SIZE) + 1
  const candidates: Array<SkylineBlock & { bandError: number }> = []
  const idealRadius = (SKYLINE_MIN_RADIUS + SKYLINE_MAX_RADIUS) / 2

  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const block = blockForCell(cellX, cellZ)
      if (!block) continue
      const distance = Math.hypot(block.x - playerX, block.z - playerZ)
      if (distance < SKYLINE_MIN_RADIUS || distance > SKYLINE_MAX_RADIUS) continue
      candidates.push({ ...block, bandError: Math.abs(distance - idealRadius) })
    }
  }

  return candidates
    .sort((left, right) => left.bandError - right.bandError || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, Math.min(SKYLINE_MAX_BLOCKS, limit)))
    .map(({ bandError: _bandError, ...block }) => block)
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function skylineSelectionKey(blocks: SkylineBlock[]) {
  return blocks.map((block) => block.id).sort().join('|')
}

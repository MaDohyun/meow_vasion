export const SKYLINE_CELL_SIZE = 26
export const SKYLINE_MAX_BLOCKS = 40
export const SKYLINE_HEADING_STEP = Math.PI / 12

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

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

export function skylineCellKey(x: number, z: number, heading: number) {
  const cellX = Math.floor(x / SKYLINE_CELL_SIZE)
  const cellZ = Math.floor(z / SKYLINE_CELL_SIZE)
  const headingSector = Math.round(heading / SKYLINE_HEADING_STEP)
  return { cellX, cellZ, headingSector, key: `${cellX}:${cellZ}:${headingSector}` }
}

export function generateSkylineBlocks(
  playerX: number,
  playerZ: number,
  heading: number,
  limit = SKYLINE_MAX_BLOCKS,
): SkylineBlock[] {
  const centerX = Math.floor(playerX / SKYLINE_CELL_SIZE)
  const centerZ = Math.floor(playerZ / SKYLINE_CELL_SIZE)
  const quantizedHeading = Math.round(heading / SKYLINE_HEADING_STEP) * SKYLINE_HEADING_STEP
  const candidates: Array<SkylineBlock & { score: number }> = []

  for (let dz = -13; dz <= 13; dz += 1) {
    for (let dx = -13; dx <= 13; dx += 1) {
      const radius = Math.hypot(dx, dz)
      if (radius < 9 || radius > 13) continue
      const angle = Math.atan2(dx, dz)
      const angularDistance = Math.abs(wrapAngle(angle - quantizedHeading))
      if (angularDistance > Math.PI * 0.58) continue
      const cellX = centerX + dx
      const cellZ = centerZ + dz
      const seed = seedForSkylineCell(cellX, cellZ)
      const width = 14 + (seed & 7) * 1.35
      const depth = 13 + ((seed >>> 3) & 7) * 1.2
      const height = 22 + ((seed >>> 7) % 49)
      candidates.push({
        id: `${cellX}:${cellZ}`,
        cellX,
        cellZ,
        x: cellX * SKYLINE_CELL_SIZE,
        z: cellZ * SKYLINE_CELL_SIZE,
        width,
        depth,
        height,
        colorIndex: (seed >>> 15) % 5,
        score: angularDistance * 4 + Math.abs(radius - 11) * 0.08 + (seed % 997) / 99700,
      })
    }
  }

  return candidates
    .sort((left, right) => left.score - right.score || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, Math.min(SKYLINE_MAX_BLOCKS, limit)))
    .map(({ score: _score, ...block }) => block)
}

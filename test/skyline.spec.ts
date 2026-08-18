import { describe, expect, it } from 'vitest'
import {
  SKYLINE_CELL_SIZE,
  SKYLINE_MAX_BLOCKS,
  generateSkylineBlocks,
  seedForSkylineCell,
  skylineCellKey,
} from '../src/core/skyline'

describe('procedural distant skyline', () => {
  it('is deterministic for the same cell and heading', () => {
    const first = generateSkylineBlocks(31, -18, 0.72)
    const second = generateSkylineBlocks(31, -18, 0.72)
    expect(second).toEqual(first)
    expect(seedForSkylineCell(7, -4)).toBe(seedForSkylineCell(7, -4))
  })

  it('reuses a capped pool of distant cells', () => {
    const blocks = generateSkylineBlocks(0, 0, 0)
    expect(blocks).toHaveLength(SKYLINE_MAX_BLOCKS)
    expect(new Set(blocks.map((block) => block.id)).size).toBe(blocks.length)
    for (const block of blocks) {
      const distanceInCells = Math.hypot(block.cellX, block.cellZ)
      expect(distanceInCells).toBeGreaterThanOrEqual(9)
      expect(distanceInCells).toBeLessThanOrEqual(13)
    }
  })

  it('changes the visible silhouette only after crossing a cell or heading sector', () => {
    expect(skylineCellKey(2, 3, 0).key).toBe(skylineCellKey(SKYLINE_CELL_SIZE - 1, 3, 0.02).key)
    expect(generateSkylineBlocks(0, 0, 0).map((block) => block.id))
      .not.toEqual(generateSkylineBlocks(0, 0, Math.PI).map((block) => block.id))
  })
})

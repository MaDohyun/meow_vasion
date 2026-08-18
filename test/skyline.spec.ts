import { describe, expect, it } from 'vitest'
import {
  SKYLINE_CELL_SIZE,
  SKYLINE_MAX_BLOCKS,
  SKYLINE_RADIUS,
  generateSkylineBlocks,
  seedForSkylineCell,
  skylineCellKey,
} from '../src/core/skyline'

describe('procedural distant skyline', () => {
  it('is deterministic and depends only on player position', () => {
    const first = generateSkylineBlocks(31, -18)
    const second = generateSkylineBlocks(31, -18)
    expect(second).toEqual(first)
    expect(seedForSkylineCell(7, -4)).toBe(seedForSkylineCell(7, -4))
  })

  it('fills a capped 360-degree ring at roughly 300 units', () => {
    const blocks = generateSkylineBlocks(0, 0)
    expect(blocks).toHaveLength(SKYLINE_MAX_BLOCKS)
    expect(new Set(blocks.map((block) => block.id)).size).toBe(blocks.length)
    const center = SKYLINE_CELL_SIZE / 2
    for (const block of blocks) {
      const distance = Math.hypot(block.x - center, block.z - center)
      expect(distance).toBeGreaterThanOrEqual(SKYLINE_RADIUS - 8)
      expect(distance).toBeLessThanOrEqual(SKYLINE_RADIUS + 8.001)
    }
    expect(blocks.filter((block) => block.x > center && block.z > center).length).toBeGreaterThan(12)
    expect(blocks.filter((block) => block.x < center && block.z < center).length).toBeGreaterThan(12)
  })

  it('updates only after crossing a position cell', () => {
    expect(skylineCellKey(2, 3).key).toBe(skylineCellKey(SKYLINE_CELL_SIZE - 1, 3).key)
    expect(skylineCellKey(2, 3).key).not.toBe(skylineCellKey(SKYLINE_CELL_SIZE + 1, 3).key)
  })
})

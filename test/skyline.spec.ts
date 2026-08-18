import { describe, expect, it } from 'vitest'
import {
  SKYLINE_MAX_BLOCKS,
  SKYLINE_MAX_RADIUS,
  SKYLINE_MIN_RADIUS,
  generateSkylineBlocks,
  seedForSkylineCell,
  skylineSelectionKey,
} from '../src/core/skyline'

describe('world-fixed procedural skyline', () => {
  it('is deterministic from each block cell coordinate', () => {
    const first = generateSkylineBlocks(31, -18)
    const second = generateSkylineBlocks(31, -18)
    expect(second).toEqual(first)
    expect(seedForSkylineCell(7, -4)).toBe(seedForSkylineCell(7, -4))
    expect(skylineSelectionKey(second)).toBe(skylineSelectionKey(first))
    expect(skylineSelectionKey([...second].reverse())).toBe(skylineSelectionKey(first))
  })

  it('fills a capped 360-degree world-space band', () => {
    const blocks = generateSkylineBlocks(0, 0)
    expect(blocks.length).toBeGreaterThan(24)
    expect(blocks.length).toBeLessThanOrEqual(SKYLINE_MAX_BLOCKS)
    expect(new Set(blocks.map((block) => block.id)).size).toBe(blocks.length)
    for (const block of blocks) {
      const distance = Math.hypot(block.x, block.z)
      expect(distance).toBeGreaterThanOrEqual(SKYLINE_MIN_RADIUS)
      expect(distance).toBeLessThanOrEqual(SKYLINE_MAX_RADIUS)
    }
    expect(blocks.some((block) => block.x > 0 && block.z > 0)).toBe(true)
    expect(blocks.some((block) => block.x < 0 && block.z < 0)).toBe(true)
  })

  it('keeps shared blocks unchanged while the player moves', () => {
    const first = generateSkylineBlocks(0, 0)
    const shifted = generateSkylineBlocks(20, 0)
    const shiftedById = new Map(shifted.map((block) => [block.id, block]))
    const shared = first.filter((block) => shiftedById.has(block.id))
    expect(shared.length).toBeGreaterThan(first.length * 0.7)
    for (const block of shared) expect(shiftedById.get(block.id)).toEqual(block)
  })
})

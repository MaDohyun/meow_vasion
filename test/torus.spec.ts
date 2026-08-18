import { describe, expect, it } from 'vitest'
import { getNeighbor, getTileIndex, nearestWrappedValue, renderOffsetsAround, wrapCoord, wrappedDistance } from '../src/core/torus'

describe('torus wrapping', () => {
  it('wraps positive and negative coordinates', () => {
    expect(wrapCoord(-1, 5)).toBe(4)
    expect(wrapCoord(5, 5)).toBe(0)
    expect(wrapCoord(7, 5)).toBe(2)
  })

  it('matches the 5x5 edge-neighbor examples', () => {
    const tileOne = { x: 0, y: 0 }
    expect(getTileIndex(getNeighbor(tileOne, { x: 0, y: -1 }, 5, 5), 5, 5) + 1).toBe(21)
    expect(getTileIndex(getNeighbor(tileOne, { x: -1, y: 0 }, 5, 5), 5, 5) + 1).toBe(5)
    expect(getTileIndex(getNeighbor(tileOne, { x: -1, y: -1 }, 5, 5), 5, 5) + 1).toBe(25)
    expect(getTileIndex(getNeighbor({ x: 4, y: 4 }, { x: 1, y: 1 }, 5, 5), 5, 5) + 1).toBe(1)
  })

  it('uses the shorter wrapped distance across an edge', () => {
    expect(wrappedDistance(-295, 295, 600)).toBe(10)
    expect(nearestWrappedValue(-295, 295, 600)).toBe(305)
  })

  it('reuses exactly nine map offsets around the current world tile', () => {
    const offsets = renderOffsetsAround({ x: 601, z: -601 }, 600)
    expect(offsets).toHaveLength(9)
    expect(new Set(offsets.map(({ x, z }) => `${x}:${z}`)).size).toBe(9)
    expect(offsets).toContainEqual({ x: 600, z: -600 })
  })
})

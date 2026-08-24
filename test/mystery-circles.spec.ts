import { describe, expect, it } from 'vitest'
import { MYSTERY_BOOST_DURATION, MYSTERY_BOOST_MAX_MULTIPLIER, mysteryBoostMultiplier } from '../src/core/mysteryCircles'
import { mysteryCircleForCell, mysteryCircleForSector, mysteryCirclesNear, type MysteryCircleSite } from '../src/core/world'

describe('mystery-circle surge', () => {
  it('starts at full speed and fades to normal over five seconds', () => {
    expect(mysteryBoostMultiplier(MYSTERY_BOOST_DURATION)).toBe(MYSTERY_BOOST_MAX_MULTIPLIER)
    expect(mysteryBoostMultiplier(0)).toBe(1)
    expect(mysteryBoostMultiplier(MYSTERY_BOOST_DURATION / 2)).toBe(1.6)
    expect(mysteryBoostMultiplier(-2)).toBe(1)
  })
})

/**
 * The radar sweeps by sector; everything else in the world asks cell by cell.
 * Two lookups over the same procedural field are only safe while they agree,
 * so that is the property pinned here rather than any particular layout.
 */
describe('mystery circle lookup', () => {
  it('agrees with the per-cell lookup over a wide patch of the grid', () => {
    let found = 0
    for (let cellZ = -40; cellZ <= 40; cellZ += 1) {
      for (let cellX = -40; cellX <= 40; cellX += 1) {
        const byCell = mysteryCircleForCell(cellX, cellZ)
        const sector = mysteryCircleForSector(Math.floor(cellX / 6), Math.floor(cellZ / 6))
        const bySector = sector && sector.cellX === cellX && sector.cellZ === cellZ ? sector.id : null
        expect(bySector, `cell ${cellX},${cellZ}`).toBe(byCell)
        if (byCell) found += 1
      }
    }
    // A patch this size must actually contain circles, or the check above is
    // only proving that two functions agree on "nothing here".
    expect(found).toBeGreaterThan(5)
  })

  it('returns every circle inside the range and none outside it', () => {
    const range = 170
    const at = { x: 900, z: -640 }
    const near = mysteryCirclesNear(at, range)
    for (const circle of near) {
      expect(Math.hypot(circle.x - at.x, circle.z - at.z)).toBeLessThanOrEqual(range)
      expect(mysteryCircleForCell(circle.cellX, circle.cellZ)).toBe(circle.id)
    }
    // Cross-checked against a brute-force cell scan wide enough to cover the
    // range, so a sector window that is one sector too narrow would fail here.
    const brute: string[] = []
    const cell = (v: number) => Math.floor(v / 34)
    for (let cellZ = cell(at.z - range) - 2; cellZ <= cell(at.z + range) + 2; cellZ += 1) {
      for (let cellX = cell(at.x - range) - 2; cellX <= cell(at.x + range) + 2; cellX += 1) {
        const id = mysteryCircleForCell(cellX, cellZ)
        if (!id) continue
        const x = (cellX + 0.5) * 34
        const z = (cellZ + 0.5) * 34
        if (Math.hypot(x - at.x, z - at.z) <= range) brute.push(id)
      }
    }
    expect(near.map((circle) => circle.id).sort()).toEqual(brute.sort())
  })

  it('reuses the array it is handed instead of allocating each frame', () => {
    const into: MysteryCircleSite[] = []
    const first = mysteryCirclesNear({ x: 0, z: 0 }, 400, into)
    expect(first).toBe(into)
    mysteryCirclesNear({ x: 40000, z: 40000 }, 1, into)
    expect(into).toHaveLength(0)
  })
})

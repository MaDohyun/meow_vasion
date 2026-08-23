import { describe, expect, it } from 'vitest'
import { HEART_WIDTH, heartState, litRunWidth } from '../src/ui/LifeHearts'

/**
 * Damage lands in half pips (HEALTH_LOSS), so the pixel hearts have to show a
 * half. They do it by trimming each pixel run at a shared vertical fill line
 * rather than by swapping sprites - which is right only if the trim is exact.
 */
describe('pixel heart fill', () => {
  it('lights a whole heart at full', () => {
    expect(litRunWidth(0, HEART_WIDTH, 1)).toBe(HEART_WIDTH)
    expect(litRunWidth(6, 2, 1)).toBe(2)
  })

  it('lights nothing at empty, including a run at the far left', () => {
    expect(litRunWidth(0, HEART_WIDTH, 0)).toBe(0)
    expect(litRunWidth(1, 2, 0)).toBe(0)
  })

  it('cuts a half heart down the middle', () => {
    // The widest row spans the whole heart, so it is the one that shows where
    // the line falls: half of nine.
    expect(litRunWidth(0, HEART_WIDTH, 0.5)).toBe(HEART_WIDTH / 2)
    // The left lobe is wholly inside the lit half, the right lobe wholly out.
    expect(litRunWidth(1, 2, 0.5)).toBe(2)
    expect(litRunWidth(6, 2, 0.5)).toBe(0)
  })

  it('never lets a run stick out past its own width or the fill line', () => {
    for (const fill of [-0.4, 0, 0.13, 0.5, 0.87, 1, 1.6]) {
      for (const [x, width] of [[0, 9], [1, 4], [5, 4], [3, 3], [4, 1]] as const) {
        const lit = litRunWidth(x, width, fill)
        expect(lit).toBeGreaterThanOrEqual(0)
        expect(lit).toBeLessThanOrEqual(width)
        expect(x + lit).toBeLessThanOrEqual(HEART_WIDTH)
      }
    }
  })

  it('reports a part heart for any damage short of a whole pip', () => {
    expect(heartState(1)).toBe('full')
    expect(heartState(0.5)).toBe('part')
    expect(heartState(0)).toBe('empty')
    // A heart past the current health reads as empty, not as a negative fill.
    expect(heartState(-2)).toBe('empty')
  })
})

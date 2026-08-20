import { describe, expect, it } from 'vitest'
import { projectToRadar } from '../src/ui/radarProjection'

const CENTER = 50
const SCALE = 1

/**
 * A wrong rotation sign still moves the blips, just the wrong way, so this
 * pins the one property that matters: whatever the heading, something ahead of
 * the craft draws above centre and something to its right draws to the right.
 */
describe('radar projection', () => {
  it('puts what is ahead at the top, facing +z', () => {
    const { px, py } = projectToRadar(0, 10, 0, CENTER, SCALE)
    expect(py).toBeLessThan(CENTER)
    expect(px).toBeCloseTo(CENTER, 6)
  })

  it('puts what is to starboard on the right, facing +z', () => {
    const { px, py } = projectToRadar(10, 0, 0, CENTER, SCALE)
    expect(px).toBeGreaterThan(CENTER)
    expect(py).toBeCloseTo(CENTER, 6)
  })

  it('still puts what is ahead at the top after a quarter turn', () => {
    // heading pi/2 faces +x, so an object at +x is dead ahead.
    const { px, py } = projectToRadar(10, 0, Math.PI / 2, CENTER, SCALE)
    expect(py).toBeLessThan(CENTER)
    expect(px).toBeCloseTo(CENTER, 6)
  })

  it('still puts starboard on the right after a quarter turn', () => {
    // Right of a craft facing +x is -z.
    const { px, py } = projectToRadar(0, -10, Math.PI / 2, CENTER, SCALE)
    expect(px).toBeGreaterThan(CENTER)
    expect(py).toBeCloseTo(CENTER, 6)
  })

  it('keeps forward above centre for every heading', () => {
    for (let step = 0; step < 24; step += 1) {
      const heading = (step / 24) * Math.PI * 2
      const ahead = projectToRadar(Math.sin(heading) * 12, Math.cos(heading) * 12, heading, CENTER, SCALE)
      expect(ahead.py, `heading ${heading.toFixed(2)}`).toBeLessThan(CENTER - 11)
      const behind = projectToRadar(-Math.sin(heading) * 12, -Math.cos(heading) * 12, heading, CENTER, SCALE)
      expect(behind.py, `heading ${heading.toFixed(2)}`).toBeGreaterThan(CENTER + 11)
    }
  })
})

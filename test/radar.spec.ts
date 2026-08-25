import { describe, expect, it } from 'vitest'
import { clampToRadarRim, projectToRadar } from '../src/ui/radarProjection'

const CENTER = 50
const SCALE = 1

/**
 * A wrong rotation sign still moves the blips, just the wrong way, so this
 * pins the one property that matters: whatever the heading, something ahead of
 * the craft draws above centre and something to its right draws to the right.
 *
 * "Right" here is the pilot's right out of the window, which is the chase
 * camera's x axis, (-cos h, sin h) - not the vector `drone.ts` names
 * `rightX`/`rightZ`, which is its negative. These cases used to assert the
 * latter, so they passed while the dial was mirrored.
 */
describe('radar projection', () => {
  it('puts what is ahead at the top, facing +z', () => {
    const { px, py } = projectToRadar(0, 10, 0, CENTER, SCALE)
    expect(py).toBeLessThan(CENTER)
    expect(px).toBeCloseTo(CENTER, 6)
  })

  it('puts what is to starboard on the right, facing +z', () => {
    // Facing +z the camera looks down +z, so its right is -x: starboard is -x.
    const { px, py } = projectToRadar(-10, 0, 0, CENTER, SCALE)
    expect(px).toBeGreaterThan(CENTER)
    expect(py).toBeCloseTo(CENTER, 6)
  })

  it('puts what is to port on the left, facing +z', () => {
    const { px, py } = projectToRadar(10, 0, 0, CENTER, SCALE)
    expect(px).toBeLessThan(CENTER)
    expect(py).toBeCloseTo(CENTER, 6)
  })

  it('still puts what is ahead at the top after a quarter turn', () => {
    // heading pi/2 faces +x, so an object at +x is dead ahead.
    const { px, py } = projectToRadar(10, 0, Math.PI / 2, CENTER, SCALE)
    expect(py).toBeLessThan(CENTER)
    expect(px).toBeCloseTo(CENTER, 6)
  })

  it('still puts starboard on the right after a quarter turn', () => {
    // Right of a craft facing +x is +z.
    const { px, py } = projectToRadar(0, 10, Math.PI / 2, CENTER, SCALE)
    expect(px).toBeGreaterThan(CENTER)
    expect(py).toBeCloseTo(CENTER, 6)
  })

  /**
   * The mirror bug this pins was invisible to a forward-only check: negating
   * the x axis leaves every "ahead is up" case passing. So walk the headings
   * and compare the dial's x against the chase camera's own right axis, which
   * three builds as normalize(up x (eye - target)) = (-cos h, sin h).
   */
  it('agrees with the chase camera right axis for every heading', () => {
    for (let step = 0; step < 24; step += 1) {
      const heading = (step / 24) * Math.PI * 2
      const rightX = -Math.cos(heading)
      const rightZ = Math.sin(heading)
      const starboard = projectToRadar(rightX * 12, rightZ * 12, heading, CENTER, SCALE)
      expect(starboard.px, `heading ${heading.toFixed(2)}`).toBeCloseTo(CENTER + 12, 6)
      expect(starboard.py, `heading ${heading.toFixed(2)}`).toBeCloseTo(CENTER, 6)
      const port = projectToRadar(-rightX * 12, -rightZ * 12, heading, CENTER, SCALE)
      expect(port.px, `heading ${heading.toFixed(2)}`).toBeCloseTo(CENTER - 12, 6)
      expect(port.py, `heading ${heading.toFixed(2)}`).toBeCloseTo(CENTER, 6)
    }
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

/**
 * The objective and the dreadnought both ride the rim rather than dropping off
 * the sweep. The dreadnought is the reason this is shared code: it orbits at
 * 118 and pursues to 177, past the 170 the dial covers, so it spends part of
 * every boss wave outside it.
 */
describe('radar rim clamp', () => {
  const EDGE = 40

  it('leaves a contact inside the rim exactly where it was', () => {
    const inside = clampToRadarRim(CENTER + 10, CENTER - 5, CENTER, EDGE)
    expect(inside.clamped).toBe(false)
    expect(inside.px).toBe(CENTER + 10)
    expect(inside.py).toBe(CENTER - 5)
  })

  it('pulls a contact past the rim back onto it, keeping its bearing', () => {
    const far = clampToRadarRim(CENTER + 300, CENTER + 400, CENTER, EDGE)
    expect(far.clamped).toBe(true)
    expect(Math.hypot(far.px - CENTER, far.py - CENTER)).toBeCloseTo(EDGE, 6)
    // 3-4-5: the bearing has to survive the clamp or the arrow points wrong.
    expect(far.px).toBeCloseTo(CENTER + EDGE * 0.6, 6)
    expect(far.py).toBeCloseTo(CENTER + EDGE * 0.8, 6)
    expect(far.angle).toBeCloseTo(Math.atan2(4, 3), 6)
  })

  it('holds the bearing of a battleship at pursuit range for every heading', () => {
    // Radar range 170, dial half-width 74, so 177 metres out is off the sweep.
    const scale = 74 / 170
    for (let step = 0; step < 16; step += 1) {
      const bearing = (step / 16) * Math.PI * 2
      const dx = Math.sin(bearing) * 177
      const dz = Math.cos(bearing) * 177
      // Starboard is (-cos h, sin h), so a contact at world bearing b sits to
      // starboard when sin(h - b) > 0 - that is, at h = b + 0.7.
      const heading = bearing + 0.7
      const projected = projectToRadar(dx, dz, heading, 74, scale)
      const rim = clampToRadarRim(projected.px, projected.py, 74, 74 - 11)
      expect(rim.clamped, `bearing ${bearing.toFixed(2)}`).toBe(true)
      // The ship sits 0.7rad to starboard of the nose, so its mark stays
      // right of centre on a heading-up dial whichever way the craft points.
      expect(rim.px, `bearing ${bearing.toFixed(2)}`).toBeGreaterThan(74)
      expect(Math.hypot(rim.px - 74, rim.py - 74)).toBeCloseTo(74 - 11, 6)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { AIM_STEER_DEADZONE, AIM_STEER_EXPONENT, DIRECTION_STICK_RADIUS, absoluteAim, aimSteer, directionStick } from '../src/core/aim'

const BOUNDS = { left: 0, top: 0, width: 800, height: 600 }

describe('cursor aiming', () => {
  it('puts the reticle under the cursor', () => {
    expect(absoluteAim({ x: 400, y: 300 }, BOUNDS)).toEqual({ x: 0, y: 0 })
    expect(absoluteAim({ x: 0, y: 0 }, BOUNDS)).toEqual({ x: -1, y: -1 })
    expect(absoluteAim({ x: 800, y: 600 }, BOUNDS)).toEqual({ x: 1, y: 1 })
  })

  it('measures from the canvas, not the page', () => {
    // The canvas is not always flush with the window - a scrolled or inset
    // shell would otherwise put the reticle a whole offset away from the
    // cursor, and the laser raycast reads the same numbers.
    const offset = { left: 120, top: 40, width: 800, height: 600 }
    expect(absoluteAim({ x: 520, y: 340 }, offset)).toEqual({ x: 0, y: 0 })
  })

  it('never leaves the viewport', () => {
    expect(absoluteAim({ x: -900, y: 4000 }, BOUNDS)).toEqual({ x: -1, y: 1 })
  })

  it('survives a canvas that has not been laid out yet', () => {
    const unlaid = absoluteAim({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 })
    expect(Number.isFinite(unlaid.x)).toBe(true)
    expect(Number.isFinite(unlaid.y)).toBe(true)
  })
})

describe('mobile direction stick', () => {
  it('uses both axes to change the direction of gaze', () => {
    const upRight = directionStick(22, -22)
    expect(upRight.steer).toBeLessThan(0)
    expect(upRight.lookPitch).toBeGreaterThan(0)
  })

  it('clamps diagonal travel to the circular gate', () => {
    const held = directionStick(500, 500)
    expect(Math.hypot(held.x, held.y)).toBeCloseTo(DIRECTION_STICK_RADIUS, 6)
    expect(Math.hypot(held.steer, held.lookPitch)).toBeCloseTo(1, 6)
  })

  it('returns neutral input at the centre', () => {
    const centred = directionStick(0, 0)
    expect(centred.x).toBe(0)
    expect(centred.y).toBe(0)
    expect(centred.steer).toBe(0)
    expect(centred.lookPitch).toBe(0)
  })
})

describe('the craft follows its gaze', () => {
  it('turns towards the side the reticle is on', () => {
    // The desktop reticle rule: the ship goes where you look. Both signs are
    // pinned because a flipped yaw is the one bug here that still looks like
    // it works.
    expect(aimSteer(0.6)).toBeLessThan(0)
    expect(aimSteer(-0.6)).toBeGreaterThan(0)
    expect(Math.abs(aimSteer(1))).toBeCloseTo(1, 6)
  })

  it('holds still while the reticle is near the middle', () => {
    expect(aimSteer(0)).toBe(0)
    expect(aimSteer(AIM_STEER_DEADZONE * 0.99)).toBe(0)
    expect(aimSteer(-AIM_STEER_DEADZONE * 0.99)).toBe(0)
    expect(aimSteer(AIM_STEER_DEADZONE * 1.01)).not.toBe(0)
  })

  it('leans before it hauls', () => {
    // Eased, not linear: half a screen out is less than half a turn, so the
    // first degrees past the dead band are a correction rather than a swerve.
    expect(AIM_STEER_EXPONENT).toBe(1.3)
    expect(Math.abs(aimSteer(0.5))).toBeCloseTo(
      Math.pow((0.5 - AIM_STEER_DEADZONE) / (1 - AIM_STEER_DEADZONE), 1.3),
      6,
    )
    expect(Math.abs(aimSteer(0.5))).toBeLessThan(Math.abs(aimSteer(1)) * 0.5)
  })

})

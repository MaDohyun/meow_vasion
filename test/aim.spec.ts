import { describe, expect, it } from 'vitest'
import { AIM_STEER_DEADZONE, TOUCH_AIM_GAIN, absoluteAim, aimSteer, dragAim, steerWithStick, type AimPoint } from '../src/core/aim'

const BOUNDS = { left: 0, top: 0, width: 800, height: 600 }
const PHONE = { left: 0, top: 0, width: 390, height: 780 }

/** Walks a finger through a drag the way the pointer listener does. */
function swipe(from: AimPoint, steps: Array<{ x: number; y: number }>, bounds = PHONE) {
  let aim = from
  let last = steps[0]!
  for (const step of steps.slice(1)) {
    aim = dragAim(aim, last, step, bounds)
    last = step
  }
  return aim
}

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

describe('touch drag aiming', () => {
  it('moves the reticle the way the finger moved', () => {
    // The whole point: drag right and down, and the reticle goes right and
    // down with you rather than snapping to the thumb.
    const aim = swipe({ x: 0, y: 0 }, [{ x: 200, y: 400 }, { x: 240, y: 460 }])
    expect(aim.x).toBeGreaterThan(0)
    expect(aim.y).toBeGreaterThan(0)
    const back = swipe({ x: 0, y: 0 }, [{ x: 200, y: 400 }, { x: 160, y: 340 }])
    expect(back.x).toBeLessThan(0)
    expect(back.y).toBeLessThan(0)
  })

  it('starts from where the reticle already is, not from the thumb', () => {
    // A finger lands wherever it reaches. Landing must not move anything -
    // only travelling does - or every fresh touch would teleport the aim.
    const held = { x: -0.4, y: 0.25 }
    expect(dragAim(held, { x: 300, y: 700 }, { x: 300, y: 700 }, PHONE)).toEqual(held)
  })

  it('reaches the screen edge inside one thumb swipe', () => {
    // At a literal 1:1 the edge is a half-screen away, which no thumb covers
    // in one go. The gain is what makes the far corner reachable.
    const swipeToEdge = (PHONE.width / 2) / TOUCH_AIM_GAIN
    const aim = swipe({ x: 0, y: 0 }, [{ x: 195, y: 400 }, { x: 195 + swipeToEdge, y: 400 }])
    expect(aim.x).toBeCloseTo(1, 6)
    expect(swipeToEdge / PHONE.width).toBeLessThan(0.4)
  })

  it('holds the reticle inside the screen', () => {
    const aim = swipe({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 5000, y: 5000 }])
    expect(aim).toEqual({ x: 1, y: 1 })
  })

  it('turns around the moment the finger does', () => {
    // Travel past the edge must not bank up: a drag that overshoots and comes
    // back should start moving on the first pixel of the return, not after it
    // has paid back everything it overshot by.
    const pinned = swipe({ x: 0, y: 0 }, [{ x: 195, y: 400 }, { x: 3000, y: 400 }])
    expect(pinned.x).toBe(1)
    const returning = dragAim(pinned, { x: 3000, y: 400 }, { x: 2990, y: 400 }, PHONE)
    expect(returning.x).toBeLessThan(1)
  })

  it('scales each axis by its own screen extent', () => {
    // A phone is far taller than it is wide. Dividing both axes by the same
    // number would make a vertical drag feel like a different control.
    const across = dragAim({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: PHONE.width / 4, y: 0 }, PHONE)
    const down = dragAim({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: PHONE.height / 4 }, PHONE)
    expect(across.x).toBeCloseTo(down.y, 6)
  })
})

describe('the craft follows its gaze', () => {
  it('turns towards the side the reticle is on', () => {
    // The mouse rule, and now the finger rule: the ship goes where you look.
    // Both signs are pinned because a flipped yaw is the one bug here that
    // still looks like it works.
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
    expect(Math.abs(aimSteer(0.5))).toBeLessThan(Math.abs(aimSteer(1)) * 0.5)
  })

  it('lets a drag steer once the stick is at rest', () => {
    // The regression this guards: the touch HUD spreads over the pointer
    // input, and its resting zero used to overwrite the drag's yaw. The ship
    // then stared straight ahead however far the reticle had been dragged.
    const dragged = aimSteer(-0.7)
    expect(steerWithStick(0, dragged)).toBe(dragged)
  })

  it('gives the stick the yaw while a thumb is on it', () => {
    // A thumb on the stick is a deliberate turn. It must not be blended with,
    // or fought by, wherever the aiming hand last left the reticle.
    expect(steerWithStick(0.8, aimSteer(-0.7))).toBe(0.8)
    expect(steerWithStick(-0.35, aimSteer(0.9))).toBe(-0.35)
  })
})

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { craftEuler, craftForward } from '../src/core/craftPose'
import { createDroneState, stepDrone, DRONE_DEFAULTS } from '../src/core/drone'

/** The hull model's nose cone sits on +Z, so that is the axis the pose has to
 *  land on the flight model's forward vector. */
const NOSE = new THREE.Vector3(0, 0, 1)

const renderedNose = (heading: number, pitch: number, tilt: number) => {
  const euler = craftEuler(heading, pitch, tilt)
  return NOSE.clone().applyEuler(new THREE.Euler(euler.x, euler.y, euler.z, euler.order))
}

describe('craft pose', () => {
  it('points the nose along the flight vector at every heading', () => {
    const pitch = (30 * Math.PI) / 180
    for (let step = 0; step < 16; step += 1) {
      const heading = (step / 16) * Math.PI * 2
      const nose = renderedNose(heading, pitch, 0)
      const forward = craftForward(heading, pitch)
      expect(nose.x).toBeCloseTo(forward.x, 6)
      expect(nose.y).toBeCloseTo(forward.y, 6)
      expect(nose.z).toBeCloseTo(forward.z, 6)
    }
  })

  it('lifts the nose for a pulled-up reticle no matter which way the craft flies', () => {
    // The bug this exists for: with the default XYZ order, a heading a quarter
    // turn off the Z axis turned the same pitch into a bank - the nose stayed
    // level and a rim dipped instead.
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 2.3]) {
      expect(renderedNose(heading, (25 * Math.PI) / 180, 0).y).toBeGreaterThan(0.4)
      expect(renderedNose(heading, (-25 * Math.PI) / 180, 0).y).toBeLessThan(-0.4)
    }
  })

  it('keeps the bank off the nose', () => {
    // A visual tilt is a look, not a flight axis: it must not steer the hull
    // away from where the craft is actually going.
    const heading = 1.1
    const pitch = 0.2
    const level = renderedNose(heading, pitch, 0)
    const banked = renderedNose(heading, pitch, DRONE_DEFAULTS.visualTiltMax)
    expect(banked.x).toBeCloseTo(level.x, 6)
    expect(banked.y).toBeCloseTo(level.y, 6)
    expect(banked.z).toBeCloseTo(level.z, 6)
  })

  it('has a pulled-up reticle climb while the hull shows a raised nose', () => {
    // Straight off the flight model rather than off a hand-written angle: a
    // reticle above centre reaches stepDrone as a positive lookPitch.
    let state = createDroneState()
    state.heading = Math.PI / 2
    const input = { throttle: 1, steer: 0, lookPitch: 1, vertical: 0, special: false }
    for (let frame = 0; frame < 60; frame += 1) {
      state = stepDrone(state, input, 1 / 60, 0, { speed: 0, stability: 0, rack: 0, special: 'none' })
    }
    expect(state.pitch).toBeGreaterThan(0)
    expect(state.velocity.y).toBeGreaterThan(0)
    // A real lift, not a floating-point crumb: under the old order this
    // heading left the nose dead level and the assertion passed on 6e-17.
    expect(renderedNose(state.heading, state.pitch, state.visualTilt).y).toBeGreaterThan(0.5)
  })
})

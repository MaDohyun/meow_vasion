import { describe, expect, it } from 'vitest'
import { createDroneState, stepDrone } from '../src/core/drone'
import { rewardForDelivery } from '../src/core/economy'

const upgrades = { speed: 0, stability: 0, rack: 0, special: 'none' as const }

describe('balance', () => {
  it('makes a full stack noticeably slower to accelerate', () => {
    let empty = createDroneState()
    let loaded = createDroneState()
    for (let i = 0; i < 30; i += 1) {
      empty = stepDrone(empty, { throttle: 1, steer: 0, vertical: 0, special: false }, 1 / 60, 0, upgrades)
      loaded = stepDrone(loaded, { throttle: 1, steer: 0, vertical: 0, special: false }, 1 / 60, 6, upgrades)
    }
    expect(empty.speed).toBeGreaterThan(loaded.speed * 1.25)
  })

  it('funds a first upgrade after one careful delivery', () => {
    expect(rewardForDelivery(3, 0.5, 'PERFECT')).toBeGreaterThanOrEqual(120)
  })

  it('supports sideways WASD strafing without changing forward speed', () => {
    let state = createDroneState()
    state.heading = 0
    for (let i = 0; i < 30; i += 1) {
      state = stepDrone(state, { throttle: 0, steer: 0, strafe: 1, vertical: 0, special: false }, 1 / 60, 0, upgrades)
    }
    expect(state.position.x).toBeGreaterThan(-67)
    expect(Math.abs(state.position.z - 60)).toBeLessThan(0.1)
    expect(state.speed).toBe(0)
  })

  it('moves vertically in the direction of mouse pitch', () => {
    let state = createDroneState()
    state.position.y = 8
    const startY = state.position.y
    for (let i = 0; i < 60; i += 1) {
      state = stepDrone(state, { throttle: 1, steer: 0, lookPitch: 1, vertical: 0, special: false }, 1 / 60, 0, upgrades)
    }
    expect(state.pitch).toBeGreaterThan(0.7)
    expect(state.position.y).toBeGreaterThan(startY + 2)
  })
})

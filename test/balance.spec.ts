import { describe, expect, it } from 'vitest'
import { collideDrone, createDroneState, DRONE_DEFAULTS, stepDrone } from '../src/core/drone'
import { rewardForDelivery } from '../src/core/economy'
import { OVERLOAD_CRUISE_FLOOR, overloadCruiseScale } from '../src/core/overload'

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

  it('flies where it is pointed with nothing held down', () => {
    // The craft supplies its own forward now. Pointed due north with a full
    // throttle nobody pressed, it leaves the spot it started on and it goes
    // the way it is facing - which is the whole of the control scheme.
    let state = createDroneState()
    state.heading = 0
    for (let i = 0; i < 60; i += 1) {
      state = stepDrone(state, { throttle: 1, steer: 0, vertical: 0, special: false }, 1 / 60, 0, upgrades)
    }
    expect(state.speed).toBeGreaterThan(20)
    expect(state.position.z).toBeGreaterThan(70)
    expect(Math.abs(state.position.x - -68)).toBeLessThan(0.5)
  })

  it('charges the greed, not the verb', () => {
    // Opening the beam is free: an empty pass with the cone out must cost the
    // same as no beam at all, or the game is pricing the one thing it is
    // teaching. What costs is what is still hanging off it, past the rating.
    const cruise = (throttle: number) => {
      let state = createDroneState()
      for (let i = 0; i < 120; i += 1) {
        state = stepDrone(state, { throttle, steer: 0, vertical: 0, special: false }, 1 / 60, 0, upgrades)
      }
      return state.speed
    }
    const open = cruise(1)
    // Exactly at the rating is exactly full speed - the penalty eases in from
    // the line rather than snapping on when the gauge pins.
    expect(overloadCruiseScale(10, 10)).toBe(1)
    expect(cruise(overloadCruiseScale(10, 10))).toBeCloseTo(open, 5)
    // Twice the rating is a craft you can feel dragging, and it is the same
    // fraction whatever size the craft is: capacity grows, so the rule must be
    // relative or it reads as a tax on growing.
    expect(overloadCruiseScale(20, 10)).toBeCloseTo(overloadCruiseScale(80, 40), 10)
    const doubled = cruise(overloadCruiseScale(20, 10))
    expect(doubled).toBeLessThan(open * 0.8)
    // Never a standstill: the way out of overload is to fly somewhere and
    // finish the meal, so the floor has to leave the craft moving.
    expect(overloadCruiseScale(10_000, 1)).toBeGreaterThanOrEqual(OVERLOAD_CRUISE_FLOOR)
    expect(cruise(OVERLOAD_CRUISE_FLOOR)).toBeGreaterThan(open * 0.4)
    // Monotonic all the way down - more load is never less penalty.
    const scales = [0, 1, 4, 9, 30].map((excess) => overloadCruiseScale(10 + excess, 10))
    expect(scales).toEqual([...scales].sort((left, right) => right - left))
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

  it('collides only with nearby active geometry without a world boundary', () => {
    const state = createDroneState()
    state.position = { x: 6000, y: 1, z: -4000 }
    state.velocity = { x: 10, y: 0, z: 0 }
    state.speed = 10
    const result = collideDrone(state, [{ minX: 5998, maxX: 6002, minY: 0, maxY: 3, minZ: -4002, maxZ: -3998 }])
    expect(result.hit).toBe(true)
    expect(result.state.position.x).toBeGreaterThan(5900)
  })

  it('reaches the faster city-flight cruising speed', () => {
    let state = createDroneState()
    for (let i = 0; i < 120; i += 1) {
      state = stepDrone(state, { throttle: 1, steer: 0, vertical: 0, special: false }, 1 / 60, 0, upgrades)
    }
    expect(state.speed).toBeGreaterThan(29)
    expect(DRONE_DEFAULTS.maxSpeed).toBe(30)
    expect(DRONE_DEFAULTS.boostSpeed).toBe(54)
    expect(DRONE_DEFAULTS.acceleration).toBe(38)
    expect(DRONE_DEFAULTS.maxHeight).toBe(130)
  })
})

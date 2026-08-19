import { describe, expect, it } from 'vitest'
import {
  TRAFFIC_MAX_CARS,
  captureTrafficCar,
  createTrafficState,
  stepTraffic,
  trafficCarIsVisible,
} from '../src/core/traffic'
import { WORLD_CELL_SIZE } from '../src/core/world'

const view = { position: { x: 0, y: 3, z: 0 }, heading: 0 }

describe('pooled road traffic', () => {
  it('spawns outside the camera view and stays under the fixed cap', () => {
    expect(TRAFFIC_MAX_CARS).toBeGreaterThanOrEqual(30)
    const state = createTrafficState(12345)
    stepTraffic(state, view, 1 / 60)
    const first = state.cars.find((car) => car.active)
    expect(first).toBeDefined()
    expect(trafficCarIsVisible(first!.position, view)).toBe(false)
    for (let frame = 0; frame < 600; frame += 1) stepTraffic(state, view, 1 / 60)
    const active = state.cars.filter((car) => car.active)
    expect(active.length).toBeGreaterThan(6)
    expect(active.length).toBeLessThanOrEqual(TRAFFIC_MAX_CARS)
  })

  it('keeps cars on lane offsets along a road axis', () => {
    const state = createTrafficState(88)
    for (let frame = 0; frame < 300; frame += 1) stepTraffic(state, view, 1 / 60)
    for (const car of state.cars.filter((item) => item.active)) {
      const crossAxis = car.axis === 'x' ? car.position.z : car.position.x
      const nearestRoad = Math.round((crossAxis - car.laneOffset) / WORLD_CELL_SIZE) * WORLD_CELL_SIZE + car.laneOffset
      expect(Math.abs(crossAxis - nearestRoad)).toBeLessThan(1e-6)
    }
  })

  it('hands a captured driving car off to beam physics', () => {
    const state = createTrafficState(991)
    stepTraffic(state, view, 1 / 60)
    const active = state.cars.find((car) => car.active)!
    expect(captureTrafficCar(state, active.id)).toBe(active)
    expect(active.active).toBe(false)
    expect(active.captured).toBe(true)
  })
})

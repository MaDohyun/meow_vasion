import { describe, expect, it } from 'vitest'
import {
  TRAFFIC_MAX_CARS,
  captureTrafficCar,
  createTrafficState,
  primeTraffic,
  stepTraffic,
  trafficCarIsVisible,
  trafficPositionIsDriveable,
} from '../src/core/traffic'
import { lakeClusterForCell, WORLD_CELL_SIZE } from '../src/core/world'

const view = { position: { x: 0, y: 3, z: 0 }, heading: 0 }

describe('pooled road traffic', () => {
  it('preloads the opening district and keeps mid-run spawns out of view', () => {
    expect(TRAFFIC_MAX_CARS).toBeGreaterThanOrEqual(30)
    const state = createTrafficState(12345)
    primeTraffic(state, view)
    expect(state.cars.filter((car) => car.active)).toHaveLength(TRAFFIC_MAX_CARS)
    const preloaded = state.cars.find((car) => car.active)!
    expect(preloaded.speed).toBeGreaterThan(0)
    const before = { ...preloaded.position }
    stepTraffic(state, view, 1 / 30)
    expect(Math.hypot(preloaded.position.x - before.x, preloaded.position.z - before.z)).toBeGreaterThan(0)

    const replacement = createTrafficState(12345)
    stepTraffic(state, view, 1 / 60)
    stepTraffic(replacement, view, 1 / 60)
    const first = replacement.cars.find((car) => car.active)
    expect(first).toBeDefined()
    expect(trafficCarIsVisible(first!.position, view)).toBe(false)
    for (let frame = 0; frame < 600; frame += 1) stepTraffic(replacement, view, 1 / 60)
    const active = replacement.cars.filter((car) => car.active)
    // The denser cadence should fill most of the fixed driving pool within a
    // few seconds instead of leaving the opening streets nearly empty.
    expect(active.length).toBeGreaterThanOrEqual(20)
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

  it('keeps a driving car alive when it leaves the camera cone', () => {
    const state = createTrafficState(19)
    const car = state.cars[0]!
    let position: { x: number; y: number; z: number } | null = null
    for (let z = 38; z <= 150 && !position; z += 2) {
      const candidate = { x: 1.5, y: 0.65, z }
      if (trafficPositionIsDriveable(candidate, 'z')) position = candidate
    }
    expect(position).not.toBeNull()
    car.active = true
    car.axis = 'z'
    car.direction = 1
    car.speed = 8
    car.position = position!
    state.spawnTimer = 999
    stepTraffic(state, { position: { x: 0, y: 3, z: 0 }, heading: Math.PI }, 1 / 60)
    expect(car.active).toBe(true)
  })

  it('hands a captured driving car off to beam physics', () => {
    const state = createTrafficState(991)
    for (let frame = 0; frame < 12 && !state.cars.some((car) => car.active); frame += 1) stepTraffic(state, view, 1 / 60)
    const active = state.cars.find((car) => car.active)!
    expect(captureTrafficCar(state, active.id)).toBe(active)
    expect(active.active).toBe(false)
    expect(active.captured).toBe(true)
  })

  it('never spawns or continues driving over a lake cell', () => {
    let lake: { x: number; z: number } | null = null
    for (let z = -18; z <= 18 && !lake; z += 1) {
      for (let x = -18; x <= 18; x += 1) {
        if (!lakeClusterForCell(x, z)) continue
        lake = { x, z }
        break
      }
    }
    expect(lake).not.toBeNull()
    const position = { x: (lake!.x + 0.5) * WORLD_CELL_SIZE, y: 0.65, z: (lake!.z + 0.5) * WORLD_CELL_SIZE }
    expect(trafficPositionIsDriveable(position)).toBe(false)

    // The opening's 3x3 park removes the road shared by its middle tiles, so
    // a lane may not use the still-green interior as a shortcut.
    expect(trafficPositionIsDriveable({ x: 17, z: WORLD_CELL_SIZE + 1.5 }, 'x')).toBe(false)

    const state = createTrafficState(17)
    const car = state.cars[0]!
    car.active = true
    car.position = position
    car.speed = 9
    // Keep this slot from being immediately recycled by the normal traffic
    // refill after the lake guard removes it.
    state.spawnTimer = 999
    stepTraffic(state, view, 1 / 60)
    expect(car.active).toBe(false)
  })
})

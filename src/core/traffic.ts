import type { Vec3 } from './drone'
import { isLakeAt, isParkAt, PARKED_CAR_COLORS, sameLandmarkCluster, WORLD_CELL_SIZE } from './world'

export const TRAFFIC_MAX_CARS = 42
/** No moving car is created inside this ring after the opening preload. */
export const TRAFFIC_SPAWN_MIN_DISTANCE = 140
export const TRAFFIC_SPAWN_MAX_DISTANCE = 250
export const TRAFFIC_REMOVE_DISTANCE = 300
/** Refill empty traffic slots ten percent faster while retaining a fixed pool. */
export const TRAFFIC_SPAWN_RATE_MULTIPLIER = 1.1
const TRAFFIC_SPAWN_INTERVAL = 0.08 / TRAFFIC_SPAWN_RATE_MULTIPLIER

export type TrafficAxis = 'x' | 'z'

export type TrafficCar = {
  slot: number
  generation: number
  id: string
  active: boolean
  captured: boolean
  axis: TrafficAxis
  direction: -1 | 1
  laneOffset: number
  speed: number
  position: Vec3
  rotation: number
  color: string
  wasVisible: boolean
}

export type TrafficState = {
  cars: TrafficCar[]
  spawnTimer: number
  randomState: number
}

export type TrafficView = {
  position: Vec3
  heading: number
  horizontalFov?: number
}

export function createTrafficState(seed = 0x51f15e): TrafficState {
  return {
    cars: Array.from({ length: TRAFFIC_MAX_CARS }, (_, slot) => ({
      slot,
      generation: 0,
      id: `traffic:${slot}:0`,
      active: false,
      captured: false,
      axis: 'z' as const,
      direction: 1 as const,
      laneOffset: 1.5,
      speed: 0,
      position: { x: 0, y: 0.65, z: 0 },
      rotation: 0,
      color: PARKED_CAR_COLORS[slot % PARKED_CAR_COLORS.length]!,
      wasVisible: false,
    })),
    spawnTimer: 0,
    randomState: seed >>> 0 || 1,
  }
}

function random(state: TrafficState) {
  let value = state.randomState || 1
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  state.randomState = value >>> 0
  return state.randomState / 0xffffffff
}

export function trafficCarIsVisible(carPosition: Vec3, view: TrafficView) {
  const dx = carPosition.x - view.position.x
  const dz = carPosition.z - view.position.z
  const distance = Math.hypot(dx, dz)
  if (distance < 0.001) return true
  const forwardX = Math.sin(view.heading)
  const forwardZ = Math.cos(view.heading)
  const dot = (dx * forwardX + dz * forwardZ) / distance
  const halfFov = (view.horizontalFov ?? 118) * Math.PI / 360
  return dot >= Math.cos(halfFov) && Math.abs(carPosition.y - view.position.y) <= Math.max(18, distance * 0.8)
}

/**
 * Whether a lane segment actually exists under a traffic car.
 *
 * A multi-tile park/lake removes its internal road strips. Testing a car
 * against that same shared-edge rule prevents it from driving over the grass
 * even though the grid coordinate still happens to fall inside the landmark.
 */
export function trafficPositionIsDriveable(position: Pick<Vec3, 'x' | 'z'>, axis?: TrafficAxis) {
  // Unlike a park's outer kerb lane, no lane may occupy water at all.
  if (isLakeAt(position)) return false
  if (!axis) return !isParkAt(position)
  if (axis === 'x') {
    const cellX = Math.floor(position.x / WORLD_CELL_SIZE)
    const roadZ = Math.round(position.z / WORLD_CELL_SIZE)
    return !sameLandmarkCluster(cellX, roadZ, cellX, roadZ - 1)
  }
  const roadX = Math.round(position.x / WORLD_CELL_SIZE)
  const cellZ = Math.floor(position.z / WORLD_CELL_SIZE)
  return !sameLandmarkCluster(roadX, cellZ, roadX - 1, cellZ)
}

function updateRotation(car: TrafficCar) {
  car.rotation = car.axis === 'x'
    ? car.direction > 0 ? Math.PI / 2 : -Math.PI / 2
    : car.direction > 0 ? 0 : Math.PI
}

function spawnTrafficCar(state: TrafficState, view: TrafficView, allowVisible = false) {
  const car = state.cars.find((item) => !item.active && !item.captured)
  if (!car) return false

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const distance = TRAFFIC_SPAWN_MIN_DISTANCE + random(state) * (TRAFFIC_SPAWN_MAX_DISTANCE - TRAFFIC_SPAWN_MIN_DISTANCE)
    // Fill nearby roads in every direction. Very close in-view positions are
    // still rejected so a car never blinks in directly in front of the UFO.
    const angle = view.heading + (random(state) - 0.5) * Math.PI * 2
    const candidateX = view.position.x + Math.sin(angle) * distance
    const candidateZ = view.position.z + Math.cos(angle) * distance
    const axis: TrafficAxis = random(state) < 0.5 ? 'x' : 'z'
    const direction: -1 | 1 = random(state) < 0.5 ? -1 : 1
    // Keep each direction on its own lane. Picking these independently let
    // two vehicles face each other on the same strip, which read as a stalled
    // collision when they were both heavy silhouettes.
    const laneOffset = direction * 1.5
    const position = axis === 'x'
      ? { x: candidateX, y: 0.65, z: Math.round(candidateZ / WORLD_CELL_SIZE) * WORLD_CELL_SIZE + laneOffset }
      : { x: Math.round(candidateX / WORLD_CELL_SIZE) * WORLD_CELL_SIZE + laneOffset, y: 0.65, z: candidateZ }
    if (!trafficPositionIsDriveable(position, axis)) continue
    // Mid-run replacements begin outside the camera cone as well as beyond
    // the safety ring. They then drive into the scene rather than blinking
    // into a road the player is already watching. The loading-time preload is
    // intentionally allowed to fill the whole surrounding district.
    if (!allowVisible && trafficCarIsVisible(position, view)) continue
    if (state.cars.some((other) => other.active && Math.hypot(other.position.x - position.x, other.position.z - position.z) < 5.5)) continue

    car.generation += 1
    car.id = `traffic:${car.slot}:${car.generation}`
    car.active = true
    car.captured = false
    car.axis = axis
    car.direction = direction
    car.laneOffset = laneOffset
    // These are traffic-pool cars, not parking props. Every slot enters an
    // actual lane with a positive speed so nothing newly spawned on a road
    // reads as a stalled vehicle.
    car.speed = 8 + random(state) * 6
    car.position = position
    car.color = PARKED_CAR_COLORS[Math.floor(random(state) * PARKED_CAR_COLORS.length)]!
    car.wasVisible = false
    updateRotation(car)
    return true
  }
  return false
}

/** Fill the fixed traffic pool before the first rendered frame. */
export function primeTraffic(state: TrafficState, view: TrafficView) {
  while (state.cars.some((car) => !car.active && !car.captured)) {
    if (!spawnTrafficCar(state, view, true)) break
  }
  state.spawnTimer = TRAFFIC_SPAWN_INTERVAL
  return state
}

function driveThroughIntersection(state: TrafficState, car: TrafficCar, previousCoordinate: number) {
  const coordinate = car.axis === 'x' ? car.position.x : car.position.z
  if (Math.floor(previousCoordinate / WORLD_CELL_SIZE) === Math.floor(coordinate / WORLD_CELL_SIZE)) return
  if (random(state) >= 0.28) return
  const crossing = Math.round(coordinate / WORLD_CELL_SIZE) * WORLD_CELL_SIZE
  if (car.axis === 'x') {
    car.position.x = crossing + car.laneOffset
    car.position.z = Math.round(car.position.z / WORLD_CELL_SIZE) * WORLD_CELL_SIZE
    car.axis = 'z'
  } else {
    car.position.z = crossing + car.laneOffset
    car.position.x = Math.round(car.position.x / WORLD_CELL_SIZE) * WORLD_CELL_SIZE
    car.axis = 'x'
  }
  if (random(state) < 0.5) car.direction = car.direction === 1 ? -1 : 1
  // A turn can reverse the travel direction. Move the lateral coordinate to
  // the matching lane after that decision, otherwise the car turns into the
  // opposing lane and appears to drive against traffic.
  car.laneOffset = car.direction * 1.5
  if (car.axis === 'x') car.position.z = crossing + car.laneOffset
  else car.position.x = crossing + car.laneOffset
  updateRotation(car)
}

export function stepTraffic(state: TrafficState, view: TrafficView, dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  state.spawnTimer -= d
  let activeCount = 0
  for (const car of state.cars) {
    if (!car.active) continue
    const previousCoordinate = car.axis === 'x' ? car.position.x : car.position.z
    car.position[car.axis] += car.speed * car.direction * d
    if (!trafficPositionIsDriveable(car.position, car.axis)) {
      car.active = false
      continue
    }
    driveThroughIntersection(state, car, previousCoordinate)
    if (!trafficPositionIsDriveable(car.position, car.axis)) {
      car.active = false
      continue
    }
    const distance = Math.hypot(car.position.x - view.position.x, car.position.z - view.position.z)
    car.wasVisible ||= trafficCarIsVisible(car.position, view)
    // Culling is radius-only. The old view-cone deletion made a car disappear
    // the moment a player turned their nose a few degrees.
    if (distance > TRAFFIC_REMOVE_DISTANCE) car.active = false
    if (car.active) activeCount += 1
  }

  if (state.spawnTimer <= 0 && activeCount < TRAFFIC_MAX_CARS) {
    state.spawnTimer = spawnTrafficCar(state, view) ? TRAFFIC_SPAWN_INTERVAL : TRAFFIC_SPAWN_INTERVAL * 0.5
  }
  return state
}

export function captureTrafficCar(state: TrafficState, id: string) {
  const car = state.cars.find((item) => item.id === id)
  if (!car || !car.active) return null
  car.active = false
  car.captured = true
  return car
}

export function releaseTrafficSlot(state: TrafficState, id: string) {
  const car = state.cars.find((item) => item.id === id)
  if (car) car.captured = false
}

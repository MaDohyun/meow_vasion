export type Vec3 = { x: number; y: number; z: number }

export type DroneInput = {
  throttle: number
  steer: number
  strafe?: number
  lookPitch?: number
  vertical: number
  special: boolean
  /** Temporary world effects can raise horizontal top speed without changing
   * the player's input range. */
  speedMultiplier?: number
}

export type DroneUpgrades = {
  speed: number
  stability: number
  rack: number
  special: 'none' | 'airbrake' | 'boost'
}

export type DroneState = {
  position: Vec3
  velocity: Vec3
  heading: number
  pitch: number
  yawVelocity: number
  visualTilt: number
  speed: number
  verticalAcceleration: number
  boostRemaining: number
  specialCooldown: number
}

export type Aabb = {
  id?: string
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export type CollisionResult = {
  state: DroneState
  impulse: number
  hit: boolean
}

export const DRONE_DEFAULTS = {
  maxSpeed: 30,
  boostSpeed: 54,
  acceleration: 38,
  brakeDeceleration: 42,
  turnRateLow: (185 * Math.PI) / 180,
  turnRateHigh: (105 * Math.PI) / 180,
  verticalSpeed: 9,
  minHeight: 0.4,
  maxHeight: 130,
  radius: 0.5,
  visualTiltMax: (28 * Math.PI) / 180,
  pitchMax: (55 * Math.PI) / 180,
} as const

export function createDroneState(): DroneState {
  return {
    position: { x: -68, y: 2.4, z: 60 },
    velocity: { x: 0, y: 0, z: 0 },
    heading: Math.PI,
    pitch: 0,
    yawVelocity: 0,
    visualTilt: 0,
    speed: 0,
    verticalAcceleration: 0,
    boostRemaining: 0,
    specialCooldown: 0,
  }
}

const approach = (value: number, target: number, amount: number) =>
  value < target ? Math.min(value + amount, target) : Math.max(value - amount, target)

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/**
 * `load` is effective mass, not a count. Cargo contributes to it, and so does
 * the craft's own size - a fat craft is slow and turns badly, a shrunken one is
 * quick. That inverse is what keeps a bad hit recoverable instead of the start
 * of a death spiral, so `load` is allowed to go negative.
 */
export function stepDrone(
  state: DroneState,
  input: DroneInput,
  dt: number,
  load: number,
  upgrades: DroneUpgrades,
): DroneState {
  const d = Math.min(dt, 0.05)
  const next: DroneState = structuredClone(state)
  next.specialCooldown = Math.max(0, next.specialCooldown - d)
  next.boostRemaining = Math.max(0, next.boostRemaining - d)

  if (input.special && next.specialCooldown <= 0) {
    if (upgrades.special === 'airbrake') {
      next.speed *= 0.08
      next.velocity.x *= 0.12
      next.velocity.z *= 0.12
      next.specialCooldown = 6
    } else if (upgrades.special === 'boost') {
      next.boostRemaining = 3
      next.specialCooldown = 7
    }
  }

  const speedUpgrade = 1 + upgrades.speed * 0.12
  const cargoAcceleration = Math.pow(0.9, load)
  const cargoTurn = Math.pow(0.93, load)
  const isBoosting = next.boostRemaining > 0
  const cargoSpeed = 1 / (1 + load * 0.13)
  const topSpeed = (isBoosting ? DRONE_DEFAULTS.boostSpeed : DRONE_DEFAULTS.maxSpeed) * speedUpgrade * cargoSpeed
  const speedMultiplier = Math.max(1, input.speedMultiplier ?? 1)
  const lowFlightBonus = next.position.y <= 1.5 ? 1.12 : 1
  const targetSpeed = input.throttle >= 0
    ? input.throttle * topSpeed * speedMultiplier * lowFlightBonus
    : input.throttle * 4
  const accel = Math.abs(targetSpeed) < Math.abs(next.speed)
    ? DRONE_DEFAULTS.brakeDeceleration
    : DRONE_DEFAULTS.acceleration * cargoAcceleration
  next.speed = approach(next.speed, targetSpeed, accel * d)

  const speedRatio = clamp(Math.abs(next.speed) / Math.max(1, topSpeed), 0, 1)
  const turnResponse = 1 + Math.max(0, upgrades.stability) * 0.15
  const turnRate = (DRONE_DEFAULTS.turnRateLow +
    (DRONE_DEFAULTS.turnRateHigh - DRONE_DEFAULTS.turnRateLow) * speedRatio) * turnResponse
  next.yawVelocity = input.steer * turnRate * cargoTurn
  next.heading += next.yawVelocity * d
  const targetPitch = clamp(input.lookPitch ?? 0, -1, 1) * DRONE_DEFAULTS.pitchMax
  next.pitch += (targetPitch - next.pitch) * (1 - Math.exp(-7.5 * d))

  const horizontalForward = Math.cos(next.pitch)
  const forwardX = Math.sin(next.heading) * horizontalForward
  const forwardY = Math.sin(next.pitch)
  const forwardZ = Math.cos(next.heading) * horizontalForward
  const rightX = Math.cos(next.heading)
  const rightZ = -Math.sin(next.heading)
  const strafeSpeed = (input.strafe ?? 0) * 14.5 * speedMultiplier
  const desiredX = forwardX * next.speed + rightX * strafeSpeed
  const desiredZ = forwardZ * next.speed + rightZ * strafeSpeed
  const lateralRetention = clamp(0.88 + load * 0.018, 0.88, 0.97)
  const steeringGrip = 1 - Math.pow(lateralRetention, d * 60)
  next.velocity.x += (desiredX - next.velocity.x) * steeringGrip
  next.velocity.z += (desiredZ - next.velocity.z) * steeringGrip

  const previousVy = next.velocity.y
  const targetVy = forwardY * next.speed + input.vertical * DRONE_DEFAULTS.verticalSpeed
  next.velocity.y = approach(next.velocity.y, targetVy, 22 * d)
  next.verticalAcceleration = (next.velocity.y - previousVy) / Math.max(d, 0.001)

  next.position.x += next.velocity.x * d
  next.position.z += next.velocity.z * d
  next.position.y += next.velocity.y * d

  if (next.position.y < DRONE_DEFAULTS.minHeight) {
    next.position.y = DRONE_DEFAULTS.minHeight
    next.velocity.y = Math.abs(next.velocity.y) * 0.35
  }
  if (next.position.y > DRONE_DEFAULTS.maxHeight) {
    next.position.y = DRONE_DEFAULTS.maxHeight
    next.velocity.y = Math.min(next.velocity.y, -2)
  }

  const targetTilt = -(input.steer + (input.strafe ?? 0) * 0.48) * DRONE_DEFAULTS.visualTiltMax * Math.min(1, speedRatio + 0.28)
  next.visualTilt += (targetTilt - next.visualTilt) * (1 - Math.exp(-10 * d))
  return next
}

export function collideDrone(state: DroneState, colliders: Aabb[]): CollisionResult {
  const next: DroneState = structuredClone(state)
  let peakImpulse = 0
  let hit = false
  const r = DRONE_DEFAULTS.radius

  for (const box of colliders) {
    if (
      next.position.x + r < box.minX || next.position.x - r > box.maxX ||
      next.position.y + r < box.minY || next.position.y - r > box.maxY ||
      next.position.z + r < box.minZ || next.position.z - r > box.maxZ
    ) continue

    const distances = [
      { axis: 'x' as const, direction: -1, value: next.position.x + r - box.minX },
      { axis: 'x' as const, direction: 1, value: box.maxX - (next.position.x - r) },
      { axis: 'y' as const, direction: -1, value: next.position.y + r - box.minY },
      { axis: 'y' as const, direction: 1, value: box.maxY - (next.position.y - r) },
      { axis: 'z' as const, direction: -1, value: next.position.z + r - box.minZ },
      { axis: 'z' as const, direction: 1, value: box.maxZ - (next.position.z - r) },
    ].sort((a, b) => a.value - b.value)
    const normal = distances[0]
    if (!normal) continue
    const incoming = Math.abs(next.velocity[normal.axis])
    peakImpulse = Math.max(peakImpulse, incoming)
    hit = true
    next.position[normal.axis] += normal.direction * normal.value
    next.velocity[normal.axis] *= -0.6
    next.speed *= 0.6
  }

  return { state: next, impulse: peakImpulse, hit }
}

export function collideCircularBoundary(state: DroneState, radius: number): CollisionResult {
  const next: DroneState = structuredClone(state)
  const distance = Math.hypot(next.position.x, next.position.z)
  if (distance <= radius) return { state: next, impulse: 0, hit: false }

  const normalX = next.position.x / Math.max(0.001, distance)
  const normalZ = next.position.z / Math.max(0.001, distance)
  next.position.x = normalX * radius
  next.position.z = normalZ * radius
  const outwardVelocity = next.velocity.x * normalX + next.velocity.z * normalZ
  const impulse = Math.abs(outwardVelocity)
  if (outwardVelocity > 0) {
    next.velocity.x -= normalX * outwardVelocity * 1.65
    next.velocity.z -= normalZ * outwardVelocity * 1.65
  }
  next.speed *= 0.62
  return { state: next, impulse, hit: true }
}

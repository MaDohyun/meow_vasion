export type Vec3 = { x: number; y: number; z: number }

export type DroneInput = {
  /**
   * The share of top speed the craft is aiming for, 0..1.
   *
   * Not a key any more. The saucer flies itself: the player points, the craft
   * goes, and the only thing a beginner has to learn is where to look. WASD
   * was the first wall in front of anyone who had never flown anything, and
   * it was buying nothing the mouse was not already saying - the ship has
   * always flown where it looks.
   *
   * What is left on this axis is the throttle the *world* holds: the beam's
   * drag, a lake's grip, and the tutorial parking the craft while the general
   * talks. Callers scale it, they do not set it from an input device.
   */
  throttle: number
  steer: number
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
  /**
   * Yaw, lerped from Low at a standstill to High at top speed.
   *
   * High is the one actually flown. Throttle is pinned at 1 now that the
   * craft flies itself forward (see GameContext), so the speed ratio sits at
   * the top of this range for the whole run and Low is only reached where the
   * world takes the throttle away - a lake, an overloaded beam, the tutorial.
   * That is also where turning matters most, so both ends went up, the top by
   * more.
   */
  turnRateLow: (200 * Math.PI) / 180,
  turnRateHigh: (120 * Math.PI) / 180,
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
  // Clamped rather than signed: there is no reverse to ask for now that the
  // throttle belongs to the world instead of to a key.
  const cruise = clamp(input.throttle, 0, 1)
  const targetSpeed = cruise * topSpeed * speedMultiplier * lowFlightBonus
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
  const desiredX = forwardX * next.speed
  const desiredZ = forwardZ * next.speed
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

  const targetTilt = -input.steer * DRONE_DEFAULTS.visualTiltMax * Math.min(1, speedRatio + 0.28)
  next.visualTilt += (targetTilt - next.visualTilt) * (1 - Math.exp(-10 * d))
  return next
}

/**
 * How hard a wall turns the nose off itself, per second of dead-on contact.
 *
 * A craft with a throttle key could always back out of a wall. This one cannot
 * - there is no reverse and no strafe, so a nose-on contact with the reticle
 * centred used to mean the craft pressed into the brickwork at a crawl until
 * the player thought to steer. Measured over the real city that was 94% of
 * headings pinned inside a minute and 71% of all flight time spent under a
 * tenth of cruise: not an edge case, the normal way a run went.
 *
 * So the wall does the steering. Scaled by how square the hit is, so a wall
 * taken at a shallow angle barely nudges - that is a scrape along a facade,
 * which is a thing players do on purpose - while a dead-on press slides the
 * nose clear and has the craft back at cruise inside a few seconds with nobody
 * touching anything.
 *
 * Near the craft's own hard-turn rate and no faster. A wall that spun the nose
 * quicker than the player can would read as the controls being taken away,
 * which is the opposite of the problem being solved: contact is only
 * intermittent once the push-off lands, so the figure buys back the frames
 * where the hull is briefly clear rather than out-turning anybody.
 */
export const WALL_DEFLECT_RATE = (210 * Math.PI) / 180

/**
 * The share of the speed it drove in with that a wall gives back outwards.
 *
 * A real bounce rather than a shove, so how hard you come off a facade is how
 * hard you went into it: brush one and you are nudged clear, fly into one at
 * cruise and it throws you back out. Under a half so it never launches the
 * craft further than it arrived from.
 */
export const WALL_BOUNCE = 0.55

/** The floor under that bounce, in units per second - what a contact with
 *  almost no inward speed still gives, so the hull always separates from the
 *  face instead of being re-resolved against it every frame. */
export const WALL_PUSH_OFF = 8

/**
 * How fast a wall lifts a craft that is pointing up, in units per second.
 *
 * Altitude comes from forward speed through the pitch, and that is the whole
 * problem for a big craft down among the towers: the same contact that stops
 * it also takes away the only thing it climbs with, so looking up does
 * nothing and the way out of a gap is closed. A wall being touched therefore
 * gives lift directly - point the nose up and you go up it, whatever the
 * craft is doing horizontally. It works downwards too, because a craft that
 * wants to drop out of a gap has exactly the same problem.
 */
export const WALL_CLIMB_SPEED = 16

/** Resolved a hair clear of the face rather than flush against it, for the
 *  same reason. */
const WALL_SKIN = 0.03

/**
 * The most speed a single contact may take, at a dead-on hit.
 *
 * It used to be a flat 40% on every contact frame regardless of angle, which
 * is what turned a sustained press into a full stop: re-acceleration adds
 * about 0.6 per frame and a 40% cut takes more than that back, so the craft
 * converged on a speed of about one. Charged by angle instead, a graze costs
 * almost nothing and a real crash costs more than it used to.
 */
const WALL_SPEED_COST = 0.55

export function collideDrone(state: DroneState, colliders: Aabb[], dt = 1 / 60): CollisionResult {
  const next: DroneState = structuredClone(state)
  let peakImpulse = 0
  let hit = false
  const r = DRONE_DEFAULTS.radius
  const d = Math.min(Math.max(0, dt), 0.05)

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
    // Unchanged, because this is what the damage model reads: how hard the
    // hull was travelling into the face it found.
    const incoming = Math.abs(next.velocity[normal.axis])
    peakImpulse = Math.max(peakImpulse, incoming)
    hit = true
    next.position[normal.axis] += normal.direction * (normal.value + WALL_SKIN)

    // How square the hit is: 1 straight into the face, 0 sliding along it.
    const horizontalForward = Math.cos(next.pitch)
    const forward = {
      x: Math.sin(next.heading) * horizontalForward,
      y: Math.sin(next.pitch),
      z: Math.cos(next.heading) * horizontalForward,
    }
    const into = Math.max(0, -forward[normal.axis] * normal.direction)

    // Keep whatever the craft had going *along* the wall and drop only what it
    // had going into it. Sliding is what makes a wall a wall rather than a
    // full stop - and what replaces the inward part is a bounce scaled to it,
    // so the harder the arrival the further it is thrown back.
    const inward = next.velocity[normal.axis] * normal.direction
    const rebound = Math.max(WALL_PUSH_OFF, Math.abs(Math.min(0, inward)) * WALL_BOUNCE)
    if (inward < 0) next.velocity[normal.axis] -= normal.direction * inward
    next.velocity[normal.axis] += normal.direction * rebound
    next.speed *= 1 - WALL_SPEED_COST * into

    // A wall is also a ladder. Whichever way the nose is pointing vertically,
    // touching one drives the craft that way without asking for the forward
    // speed the contact just took - which is the only way a craft wedged in a
    // gap between two towers gets out of it.
    if (normal.axis !== 'y') {
      const climb = forward.y * WALL_CLIMB_SPEED
      if (climb > 0) next.velocity.y = Math.max(next.velocity.y, climb)
      else if (climb < 0) next.velocity.y = Math.min(next.velocity.y, climb)
    }

    // And the wall turns the nose off itself. Only a wall: a roof is something
    // to skim, not something to be steered by.
    if (normal.axis !== 'y' && into > 0) {
      const rightDotNormal = (normal.axis === 'x' ? Math.cos(next.heading) : -Math.sin(next.heading)) * normal.direction
      // Turn towards whichever side the outward normal is on. Dead square onto
      // a face both sides are equal, so the craft keeps turning the way the
      // player already had it turning.
      const turn = Math.abs(rightDotNormal) > 1e-6
        ? Math.sign(rightDotNormal)
        : next.yawVelocity < 0 ? -1 : 1
      next.heading += turn * WALL_DEFLECT_RATE * into * d
    }
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

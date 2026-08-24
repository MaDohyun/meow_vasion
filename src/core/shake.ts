/**
 * Blast shake.
 *
 * A drone detonating on the hull used to read as a red flash and a 50ms
 * freeze and nothing else: the two things a player is actually looking at -
 * the craft and the frame around it - stayed perfectly still through it. This
 * is the missing half of that hit, and it is deliberately small. The old
 * continuous camera shake was cut for leaving the whole late game vibrating,
 * so this one is a single decaying kick fired by one event rather than a
 * state the game can sit in.
 */

/** Trauma is spent in about a third of a second: felt, then gone. */
export const SHAKE_DECAY = 3.4

/** What one drone blast on the hull is worth. Never enough to fill the meter,
 *  so two drones inside the same second still stack into something bigger. */
export const DRONE_BLAST_TRAUMA = 0.85

/** A helicopter ramming the hull. Smaller than a detonation - it is a body
 *  blow, not a blast - but still a kick, because four tonnes of airframe
 *  arriving at speed should not read as a scrape along a wall. */
export const HELICOPTER_RAM_TRAUMA = 0.6

export const SHAKE_TRAUMA_MAX = 1

/**
 * Radians, at full trauma. Tuned by what they do on screen rather than by the
 * numbers themselves: through the game's own chase rig these move the frame
 * about 1.6% of its width at the peak of one drone blast - felt, and over
 * before it can cost a shot. test/shake.spec.ts holds that budget.
 */
export const SHAKE_CAMERA_YAW = 0.048
export const SHAKE_CAMERA_PITCH = 0.036
export const SHAKE_CAMERA_ROLL = 0.055

/** Craft offset and tilt, the offset in hull radii so a grown saucer rattles
 *  by the same share of itself as a small one rather than twitching invisibly.
 *  Peaks around a tenth of the hull's on-screen radius: the craft is plainly
 *  shaking without ever leaving its own outline. */
export const SHAKE_CRAFT_OFFSET = 0.2
export const SHAKE_CRAFT_ROLL = 0.05

/**
 * Angular frequencies, radians per second, one per axis.
 *
 * Kept between 9 and 14Hz: fast enough to read as a blast rather than a sway,
 * slow enough to survive a 60Hz sample without turning into aliased noise.
 * The three are mutually irrational-ish so the axes never line up into a
 * single diagonal wobble.
 */
const SHAKE_RATE = { x: 74, y: 88, z: 61, yaw: 81, pitch: 95, roll: 67 } as const
const SHAKE_PHASE = { x: 0, y: 1.7, z: 3.1, yaw: 2.3, pitch: 0.9, roll: 4.2 } as const

export type ShakeState = {
  /** 0..1. The amplitude is its square, so the tail fades out instead of
   *  stepping off a cliff when it reaches zero. */
  trauma: number
  /** Drives the oscillation. Runs on simulation time so a paused game holds
   *  its pose instead of buzzing. */
  clock: number
}

export type ShakeSample = {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
}

export function createShakeState(): ShakeState {
  return { trauma: 0, clock: 0 }
}

export function createShakeSample(): ShakeSample {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 }
}

export function addShakeTrauma(state: ShakeState, amount: number) {
  state.trauma = Math.min(SHAKE_TRAUMA_MAX, state.trauma + Math.max(0, amount))
  return state.trauma
}

export function stepShake(state: ShakeState, dt: number) {
  const d = Math.max(0, dt)
  state.clock += d
  state.trauma = Math.max(0, state.trauma - d * SHAKE_DECAY)
  return state.trauma
}

/** The amplitude the sample is scaled by, 0..1. */
export function shakeAmount(state: ShakeState) {
  return state.trauma * state.trauma
}

/**
 * Fills `out` with per-axis offsets in -1..1, already scaled by the amplitude.
 * The caller multiplies by the SHAKE_CAMERA_* / SHAKE_CRAFT_* constants; this
 * stays unitless so the same sample drives both the hull and the camera.
 *
 * Writes into a caller-owned object: this runs every frame and must not
 * allocate.
 */
export function sampleShake(state: ShakeState, out: ShakeSample) {
  const amount = shakeAmount(state)
  if (amount <= 0) {
    out.x = 0
    out.y = 0
    out.z = 0
    out.yaw = 0
    out.pitch = 0
    out.roll = 0
    return out
  }
  const t = state.clock
  out.x = Math.sin(t * SHAKE_RATE.x + SHAKE_PHASE.x) * amount
  out.y = Math.sin(t * SHAKE_RATE.y + SHAKE_PHASE.y) * amount
  out.z = Math.sin(t * SHAKE_RATE.z + SHAKE_PHASE.z) * amount
  out.yaw = Math.sin(t * SHAKE_RATE.yaw + SHAKE_PHASE.yaw) * amount
  out.pitch = Math.sin(t * SHAKE_RATE.pitch + SHAKE_PHASE.pitch) * amount
  out.roll = Math.sin(t * SHAKE_RATE.roll + SHAKE_PHASE.roll) * amount
  return out
}

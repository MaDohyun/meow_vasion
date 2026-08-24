import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  DRONE_BLAST_TRAUMA,
  HELICOPTER_RAM_TRAUMA,
  HIT_TRAUMA,
  SHAKE_CAMERA_PITCH,
  SHAKE_CAMERA_ROLL,
  SHAKE_CAMERA_YAW,
  SHAKE_CRAFT_OFFSET,
  SHAKE_DECAY,
  SHAKE_TRAUMA_MAX,
  addShakeTrauma,
  createShakeSample,
  createShakeState,
  sampleShake,
  shakeAmount,
  stepShake,
} from '../src/core/shake'

describe('blast shake', () => {
  it('starts still', () => {
    const state = createShakeState()
    const sample = sampleShake(state, createShakeSample())
    expect(shakeAmount(state)).toBe(0)
    expect(Object.values(sample).every((axis) => axis === 0)).toBe(true)
  })

  it('moves the hull and the frame once a drone goes off', () => {
    const state = createShakeState()
    addShakeTrauma(state, DRONE_BLAST_TRAUMA)
    // Sampled a frame in rather than at zero: three of the six axes start on a
    // phase of zero, and a shake nobody can see is not a shake.
    stepShake(state, 1 / 60)
    const sample = sampleShake(state, createShakeSample())
    for (const axis of Object.values(sample)) expect(Math.abs(axis)).toBeGreaterThan(0)
  })

  it('keeps every axis inside the unit range it promises the render layer', () => {
    const state = createShakeState()
    addShakeTrauma(state, SHAKE_TRAUMA_MAX * 4)
    const sample = createShakeSample()
    for (let tick = 0; tick < 200; tick += 1) {
      stepShake(state, 1 / 240)
      sampleShake(state, sample)
      for (const axis of Object.values(sample)) expect(Math.abs(axis)).toBeLessThanOrEqual(1)
    }
  })

  it('never banks more than one blast of trauma', () => {
    const state = createShakeState()
    for (let hit = 0; hit < 6; hit += 1) addShakeTrauma(state, DRONE_BLAST_TRAUMA)
    expect(state.trauma).toBe(SHAKE_TRAUMA_MAX)
  })

  it('answers every source of damage, not only the explosions', () => {
    // The kick used to belong to the drone blast and the helicopter ram alone,
    // so an orb, a shell or the dreadnought's bow gun took a pip of health off
    // a craft that never moved. A hit the player cannot feel is one they have
    // to read off the health bar, which is the one place nobody is looking
    // during a fight.
    for (const [kind, trauma] of Object.entries(HIT_TRAUMA)) {
      const state = createShakeState()
      addShakeTrauma(state, trauma)
      stepShake(state, 1 / 60)
      const sample = sampleShake(state, createShakeSample())
      for (const axis of Object.values(sample)) expect(Math.abs(axis), kind).toBeGreaterThan(0)
      // One hit never fills the meter, whatever landed it, so two arriving
      // together still stack into something bigger.
      expect(state.trauma, kind).toBeLessThan(SHAKE_TRAUMA_MAX)
    }
  })

  it('prices the kick by what landed it', () => {
    const worst = Math.max(...Object.values(HIT_TRAUMA))
    const lightest = Math.min(...Object.values(HIT_TRAUMA))
    // A mine going off on the hull is still the biggest thing that can happen
    // to the craft, and a scrape along a tower is still the smallest.
    expect(HIT_TRAUMA.explosive).toBe(DRONE_BLAST_TRAUMA)
    expect(HIT_TRAUMA.explosive).toBe(worst)
    expect(HIT_TRAUMA.building).toBe(lightest)
    // Contact is the helicopter's ram, which is a body blow rather than a blast.
    expect(HIT_TRAUMA.contact).toBe(HELICOPTER_RAM_TRAUMA)
    expect(HIT_TRAUMA.contact).toBeLessThan(HIT_TRAUMA.explosive)
    // The curtain orb is the cheapest hit in the game because it is the most
    // visible one, and it shakes the least to match.
    expect(HIT_TRAUMA.orb).toBeLessThan(HIT_TRAUMA['boss-beam'])
  })

  it('stacks two drones inside the same second into a bigger kick', () => {
    const single = createShakeState()
    addShakeTrauma(single, DRONE_BLAST_TRAUMA)
    const double = createShakeState()
    addShakeTrauma(double, DRONE_BLAST_TRAUMA)
    addShakeTrauma(double, DRONE_BLAST_TRAUMA)
    expect(shakeAmount(double)).toBeGreaterThan(shakeAmount(single))
  })

  it('is spent in about a third of a second, so the late game does not vibrate', () => {
    const state = createShakeState()
    addShakeTrauma(state, DRONE_BLAST_TRAUMA)
    let elapsed = 0
    while (state.trauma > 0 && elapsed < 5) {
      stepShake(state, 1 / 60)
      elapsed += 1 / 60
    }
    expect(state.trauma).toBe(0)
    expect(elapsed).toBeLessThan(0.45)
    expect(elapsed).toBeGreaterThan(DRONE_BLAST_TRAUMA / SHAKE_DECAY)
  })

  it('decays on simulation time rather than frame count', () => {
    const fast = createShakeState()
    const slow = createShakeState()
    addShakeTrauma(fast, DRONE_BLAST_TRAUMA)
    addShakeTrauma(slow, DRONE_BLAST_TRAUMA)
    for (let tick = 0; tick < 12; tick += 1) stepShake(fast, 1 / 120)
    for (let tick = 0; tick < 6; tick += 1) stepShake(slow, 1 / 60)
    expect(fast.trauma).toBeCloseTo(slow.trauma, 10)
    expect(fast.clock).toBeCloseTo(slow.clock, 10)
  })

  it('stays a nudge on screen rather than a lurch', () => {
    // The constants are radians and world units, which say nothing about how
    // hard the shake actually reads. This puts them through the same chase rig
    // the game uses and measures the result in pixels, because "a little" is a
    // claim about the screen and nothing else.
    const width = 1920
    const height = 1080
    const camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 2000)
    const craftSize = 0.46
    const hullRadius = 1.72 * craftSize
    // A landmark far enough away to be moved by the frame turning and by
    // nothing else, which is what a player reads as the screen shaking.
    const landmark = new THREE.Vector3(18, 6, 120)
    const project = (point: THREE.Vector3) => {
      const projected = point.clone().project(camera)
      return { x: (projected.x * 0.5 + 0.5) * width, y: (-projected.y * 0.5 + 0.5) * height }
    }
    const place = (shake: ReturnType<typeof createShakeSample> | null) => {
      camera.position.set(0, 3.6, -9)
      camera.lookAt(new THREE.Vector3(0, 0, 5.5))
      if (shake) {
        camera.rotateX(shake.pitch * SHAKE_CAMERA_PITCH)
        camera.rotateY(shake.yaw * SHAKE_CAMERA_YAW)
        camera.rotateZ(shake.roll * SHAKE_CAMERA_ROLL)
      }
      camera.updateMatrixWorld(true)
    }
    place(null)
    const restLandmark = project(landmark)
    const restCraft = project(new THREE.Vector3())
    const hullOnScreen = Math.hypot(project(new THREE.Vector3(hullRadius, 0, 0)).x - restCraft.x, 0)

    const state = createShakeState()
    addShakeTrauma(state, DRONE_BLAST_TRAUMA)
    const sample = createShakeSample()
    let screen = 0
    let craft = 0
    while (state.trauma > 0) {
      stepShake(state, 1 / 60)
      sampleShake(state, sample)
      place(sample)
      const moved = project(landmark)
      screen = Math.max(screen, Math.hypot(moved.x - restLandmark.x, moved.y - restLandmark.y))
      // Measured against the steady camera, so this is the hull's own jitter
      // rather than the frame turning underneath it.
      place(null)
      const hull = project(new THREE.Vector3(sample.x, sample.y, sample.z).multiplyScalar(SHAKE_CRAFT_OFFSET * craftSize))
      craft = Math.max(craft, Math.hypot(hull.x - restCraft.x, hull.y - restCraft.y))
    }
    // Enough to be felt, nowhere near enough to lose the city.
    expect(screen / width).toBeGreaterThan(0.008)
    expect(screen / width).toBeLessThan(0.03)
    // The hull rattles inside its own outline: clearly moving, never adrift.
    expect(craft).toBeGreaterThan(hullOnScreen * 0.04)
    expect(craft).toBeLessThan(hullOnScreen * 0.25)
  })

  it('holds its pose while the game is frozen', () => {
    // The hit freeze runs before the shake, and a paused game must not buzz.
    const state = createShakeState()
    addShakeTrauma(state, DRONE_BLAST_TRAUMA)
    stepShake(state, 1 / 60)
    const before = sampleShake(state, createShakeSample())
    const frozen = { ...before }
    stepShake(state, 0)
    expect(sampleShake(state, createShakeSample())).toEqual(frozen)
  })
})

import { describe, expect, it } from 'vitest'
import {
  DRONE_DEFAULTS,
  WALL_BOUNCE,
  WALL_CLIMB_SPEED,
  WALL_DEFLECT_RATE,
  collideDrone,
  createDroneState,
  stepDrone,
  type Aabb,
  type DroneInput,
} from '../src/core/drone'
import { SIZE_MATURE, SIZE_START, sizeProfile } from '../src/core/size'
import { activeWorldColliders, updateActiveWorld } from '../src/core/world'

const upgrades = { speed: 0, stability: 0, rack: 0, special: 'none' as const }
const INPUT: DroneInput = { throttle: 1, steer: 0, lookPitch: 0, vertical: 0, special: false }

/** A wall running along z, with the craft approaching from -x. */
const wall = (): Aabb => ({ minX: 0, maxX: 40, minY: 0, maxY: 40, minZ: -40, maxZ: 40 })

/**
 * Flies one heading across the real procedural city with nobody steering, and
 * reports how much of the run it spent going nowhere.
 */
function crossTheCity(heading: number, seconds: number) {
  let state = createDroneState()
  state.heading = heading
  state.position = { x: -68, y: 8, z: 60 }
  let world = updateActiveWorld(null, state.position, true)
  let colliders = activeWorldColliders(world)
  const dt = 1 / 60
  let pinnedFrames = 0
  let longestPin = 0
  let currentPin = 0
  const frames = Math.round(seconds / dt)
  for (let frame = 0; frame < frames; frame += 1) {
    state = stepDrone(state, INPUT, dt, 0, upgrades)
    const next = updateActiveWorld(world, state.position, false)
    if (next !== world) { world = next; colliders = activeWorldColliders(world) }
    state = collideDrone(state, colliders, dt).state
    // Cruise is 30. Under a tenth of that is a craft that is not going
    // anywhere, whatever the flight model thinks it is doing.
    if (Math.abs(state.speed) < 3) {
      pinnedFrames += 1
      currentPin += dt
      longestPin = Math.max(longestPin, currentPin)
    } else currentPin = 0
  }
  return { pinnedShare: pinnedFrames / frames, longestPin }
}

describe('a wall steers the craft instead of parking it', () => {
  it('turns the nose off a face it is pressed square against', () => {
    let state = createDroneState()
    state.heading = Math.PI / 2
    state.position = { x: -0.2, y: 8, z: 0 }
    state.velocity = { x: 20, y: 0, z: 0 }
    state.speed = 20
    const result = collideDrone(state, [wall()], 1 / 60)
    expect(result.hit).toBe(true)
    // Pushed clear of the face, not left flush against it, and shoved away.
    expect(result.state.position.x).toBeLessThan(-0.5)
    expect(result.state.velocity.x).toBeLessThan(0)
    // And the nose has started to come round. One frame is a nudge; the rate
    // is what makes it a slide rather than a stop.
    expect(Math.abs(result.state.heading - state.heading)).toBeCloseTo(WALL_DEFLECT_RATE / 60, 4)
  })

  it('charges a graze almost nothing and a square hit more than a graze', () => {
    const at = (heading: number) => {
      let state = createDroneState()
      state.heading = heading
      state.position = { x: -0.2, y: 8, z: 0 }
      state.velocity = { x: 20, y: 0, z: 0 }
      state.speed = 20
      return collideDrone(state, [wall()], 1 / 60).state.speed
    }
    // Square onto the face (+x) versus sliding along it (+z).
    const square = at(Math.PI / 2)
    const graze = at(0)
    expect(square).toBeLessThan(20 * 0.5)
    expect(graze).toBeGreaterThan(20 * 0.98)
  })

  it('never converges on a standstill while held against a wall', () => {
    // The old failure: a flat speed cost on every contact frame took back more
    // than re-acceleration added, so a sustained press settled at a crawl and
    // stayed there. Nothing here steers - the wall has to do all of it.
    let state = createDroneState()
    state.heading = Math.PI / 2
    state.position = { x: -0.6, y: 8, z: 0 }
    for (let frame = 0; frame < 300; frame += 1) {
      state = stepDrone(state, INPUT, 1 / 60, 0, upgrades)
      state = collideDrone(state, [wall()], 1 / 60).state
    }
    // Five seconds of the worst case there is - square onto a forty-metre
    // facade with nobody touching the mouse. It comes out at cruise.
    expect(state.speed).toBeGreaterThan(25)
    // And it left along the wall rather than sitting on it.
    expect(Math.abs(state.position.z)).toBeGreaterThan(35)
  })

  it('throws the craft back harder the harder it arrives', () => {
    const arriveAt = (speed: number) => {
      let state = createDroneState()
      state.heading = Math.PI / 2
      state.position = { x: -0.2, y: 8, z: 0 }
      state.velocity = { x: speed, y: 0, z: 0 }
      state.speed = speed
      return collideDrone(state, [wall()], 1 / 60).state.velocity.x
    }
    // A wall gives back a share of what it was hit with, so brushing one is a
    // nudge and flying into one at cruise throws you off it.
    expect(arriveAt(30)).toBeCloseTo(-30 * WALL_BOUNCE, 3)
    expect(arriveAt(30)).toBeLessThan(arriveAt(8))
    // ...but never further than it arrived from.
    expect(Math.abs(arriveAt(30))).toBeLessThan(30)
  })

  it('lifts a craft that touches a wall in whatever direction it is looking', () => {
    // Altitude comes from forward speed through the pitch, so a contact that
    // takes the speed also takes the climb - which is how a craft ends up
    // pressed against a facade with the nose up and going nowhere. Touching a
    // wall therefore drives the craft vertically on its own, with no forward
    // speed asked for.
    const touch = (pitch: number, speed: number) => {
      let state = createDroneState()
      state.heading = Math.PI / 2
      state.pitch = pitch
      state.position = { x: -0.2, y: 8, z: 0 }
      state.velocity = { x: speed, y: 0, z: 0 }
      state.speed = speed
      return collideDrone(state, [wall()], 1 / 60).state.velocity.y
    }
    // Nose up against the wall: rising, even from a dead stop.
    expect(touch(DRONE_DEFAULTS.pitchMax, 0)).toBeCloseTo(Math.sin(DRONE_DEFAULTS.pitchMax) * WALL_CLIMB_SPEED, 5)
    expect(touch(DRONE_DEFAULTS.pitchMax, 0)).toBeGreaterThan(10)
    // Nose down: the same, downwards - a craft wanting out of a gap the other
    // way has exactly the same problem.
    expect(touch(-DRONE_DEFAULTS.pitchMax, 0)).toBeLessThan(-10)
    // Level: the wall is not a lift, it only follows the nose.
    expect(touch(0, 20)).toBe(0)
  })

  it('gives the craft one body, the hull, whatever it touches', () => {
    // Enemies were already resolved against sizeProfile.hitRadius - a mine
    // goes off on the hull, not on the centre - while buildings used a fixed
    // half metre. A grown saucer thirty metres across therefore flew through
    // the city as a marble, clipping visibly through the towers it was
    // supposedly too big for.
    const box: Aabb[] = [{ minX: 0, maxX: 40, minY: 0, maxY: 40, minZ: -40, maxZ: 40 }]
    const grazes = (radius: number) => {
      const state = createDroneState()
      state.heading = Math.PI / 2
      // Ten metres clear of the face: nothing under a ten-metre hull touches.
      state.position = { x: -10, y: 8, z: 0 }
      state.velocity = { x: 20, y: 0, z: 0 }
      state.speed = 20
      return collideDrone(state, box, 1 / 60, radius).hit
    }
    expect(grazes(DRONE_DEFAULTS.radius)).toBe(false)
    expect(grazes(sizeProfile(SIZE_START).hitRadius)).toBe(false)
    expect(grazes(sizeProfile(SIZE_MATURE).hitRadius)).toBe(true)
    // And the hull it is given is the same one the enemies measure against.
    expect(sizeProfile(SIZE_MATURE).hitRadius).toBeGreaterThan(10)
  })

  it('crosses the real city on any heading without parking on a building', () => {
    // The whole point of removing the movement keys is that a beginner never
    // has to be taught one. A craft that stops dead on the first facade it
    // meets and needs a deliberate steer to leave teaches exactly that, so
    // this sweeps the actual procedural city rather than a test box.
    const seconds = 40
    const headings = 24
    const runs = Array.from({ length: headings }, (_, index) =>
      crossTheCity((index / headings) * Math.PI * 2, seconds))
    const stuck = runs.filter((run) => run.longestPin >= 2)
    const meanPinned = runs.reduce((sum, run) => sum + run.pinnedShare, 0) / runs.length
    // Before the wall slide these read 22/24 headings, 71% of all flight time
    // and a worst case of 58 seconds out of 60.
    expect(stuck).toHaveLength(0)
    expect(meanPinned).toBeLessThan(0.02)
    expect(Math.max(...runs.map((run) => run.longestPin))).toBeLessThan(1)
  }, 60_000)
})

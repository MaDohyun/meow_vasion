import { describe, expect, it } from 'vitest'
import { stepBeamObjects, type BeamField } from '../src/core/beam'
import { beginNearbyCrowdAbsorption, createCrowdState, stepCrowds } from '../src/core/crowds'
import { createDroneState, stepDrone, type DroneInput } from '../src/core/drone'
import { SIZE_GAIN, SIZE_MAX, growSize, sizeProfile, SIZE_START } from '../src/core/size'

const UPGRADES = { speed: 0.45, stability: 0, rack: 0, special: 'none' as const }

/**
 * Flies a scripted low pass across a seeded crowd and counts what gets eaten.
 *
 * Feeding is the entire game now - if a competent pass cannot reliably catch
 * bodies, the player shrinks no matter how well they fly, so this guards the
 * core loop rather than any one function.
 */
function flyAndFeed(seconds: number, startSize = SIZE_START, seed = 4242, steer = false, altitude = 7, park = false) {
  const drone = createDroneState()
  drone.position = { x: 0, y: altitude, z: 0 }
  const crowds = createCrowdState(seed)
  stepCrowds(crowds, { position: drone.position, heading: 0 }, 0)
  let size = startSize
  let absorbed = 0
  const input: DroneInput = { throttle: park ? 0 : 1, steer: 0, strafe: 0, lookPitch: 0, vertical: 0, special: false }
  // A steering pilot points at the nearest gathering, the way a player reading
  // the radar would. Crowds arrive in knots, so this is the intended play - the
  // blind pass below is the floor, not the target.
  const aimAtNearest = (position: { x: number; z: number }, heading: number) => {
    let best = Number.POSITIVE_INFINITY
    let bearing = heading
    for (const object of crowds.objects) {
      if (!object.active) continue
      const dx = object.position.x - position.x
      const dz = object.position.z - position.z
      const distance = Math.hypot(dx, dz)
      if (distance >= best) continue
      best = distance
      bearing = Math.atan2(dx, dz)
    }
    if (!Number.isFinite(best)) return 0
    const delta = Math.atan2(Math.sin(bearing - heading), Math.cos(bearing - heading))
    return Math.max(-1, Math.min(1, delta * 1.6))
  }
  const dt = 1 / 60
  let state = drone
  for (let frame = 0; frame < seconds * 60; frame += 1) {
    const profile = sizeProfile(size)
    if (steer) input.steer = aimAtNearest(state.position, state.heading)
    state = stepDrone(state, input, dt, 0, UPGRADES)
    state.position.y = altitude
    const threats = [{ ...state.position }]
    stepCrowds(crowds, { position: state.position, heading: state.heading, threats, crowdThreatStart: 1 }, dt)
    const field: BeamField = {
      active: true, boosting: false,
      position: state.position, velocity: state.velocity,
      radiusScale: profile.beamScale,
      // The craft's natural grip, which the game passes and this harness used
      // to leave out - so it silently measured a beam at full strength and
      // reported the core loop healthy while the real opening craft could not
      // pick anybody up at all.
      gripScale: profile.beamPower,
    }
    stepBeamObjects(crowds.objects, field, dt)
    let eaten = beginNearbyCrowdAbsorption(crowds, state.position, profile.absorbDistance)
    while (eaten) {
      absorbed += 1
      size = growSize(size, eaten.kind)
      eaten = beginNearbyCrowdAbsorption(crowds, state.position, sizeProfile(size).absorbDistance)
    }
  }
  return { absorbed, size }
}

/**
 * A single straight pass is dominated by where one seed happened to drop
 * people, so every measurement here is an average. Tuning the loop against one
 * sample means tuning against noise.
 */
function averageFeed(seconds: number, startSize = SIZE_START, steer = false, altitude = 7, park = false) {
  const seeds = [4242, 9137, 31, 77021, 555, 12345]
  let total = 0
  for (const seed of seeds) total += flyAndFeed(seconds, startSize, seed, steer, altitude, park).absorbed
  return total / seeds.length
}

describe('feeding is the core loop', () => {
  it('starves a player who sits still', () => {
    // Hovering with the beam on used to be the strongest play in the game:
    // park zones were chosen without looking at how close they were, so a
    // craft parked over a park had food respawning at its feet indefinitely.
    // Moving has to be the only way to eat.
    const parked = averageFeed(25, SIZE_START, false, 7, true)
    const moving = averageFeed(25)
    expect(parked).toBeLessThan(moving / 3)
    expect(parked).toBeLessThan(2)
  })

  it('rewards steering toward a gathering over flying straight', () => {
    const blind = averageFeed(25)
    const steered = averageFeed(25, SIZE_START, true)
    console.log('absorbed per 25s — blind:', blind, 'steered:', steered)
    // Crowds arrive in knots so they can be spotted and flown to. If going to
    // them were not clearly better, the clustering would be decoration.
    expect(steered).toBeGreaterThan(blind * 1.5)
  })

  it('keeps even a blind pass above starvation', () => {
    // The floor matters: a player busy dodging must not starve outright. Growth
    // is proportional now, so the meaningful figure is what a run does to the
    // craft rather than how many bodies it counted - a blind pass has to at
    // least double the saucer over a run.
    const blindOverRun = averageFeed(25) * (300 / 25)
    expect(Math.pow(1 + SIZE_GAIN.pedestrian, blindOverRun)).toBeGreaterThan(2)
  })

  it('leaves room to keep growing for the whole run', () => {
    // Size no longer falls, so the question is not whether feeding out-paces
    // damage - it is whether the ceiling is far enough away that the last
    // minute still has something to reach for. Raising the growth rate without
    // raising the ceiling just means capping out early and flying a fixed-size
    // craft for four minutes.
    const perTwentyFive = averageFeed(25, SIZE_START, true)
    const overFiveMinutes = perTwentyFive * (300 / 25) * SIZE_GAIN.pedestrian
    expect(overFiveMinutes).toBeGreaterThan(SIZE_MAX * 0.25)
    expect(SIZE_MAX - SIZE_START).toBeGreaterThan(overFiveMinutes * 0.3)
  })

  it('a bigger craft feeds faster, because the beam widened', () => {
    const small = averageFeed(18, SIZE_START, true)
    const big = averageFeed(18, SIZE_START * 6, true)
    expect(big).toBeGreaterThan(small)
  })
})

import { describe, expect, it } from 'vitest'
import { stepBeamObjects, type BeamField } from '../src/core/beam'
import { beginNearbyCrowdAbsorption, createCrowdState, stepCrowds } from '../src/core/crowds'
import { createDroneState, stepDrone, type DroneInput } from '../src/core/drone'
import { SIZE_GAIN, SIZE_LOSS, growSize, sizeProfile, SIZE_START } from '../src/core/size'

const UPGRADES = { speed: 0.45, stability: 0, rack: 0, special: 'none' as const }

/**
 * Flies a scripted low pass across a seeded crowd and counts what gets eaten.
 *
 * Feeding is the entire game now - if a competent pass cannot reliably catch
 * bodies, the player shrinks no matter how well they fly, so this guards the
 * core loop rather than any one function.
 */
function flyAndFeed(seconds: number, startSize = SIZE_START, seed = 4242) {
  const drone = createDroneState()
  drone.position = { x: 0, y: 3.2, z: 0 }
  const crowds = createCrowdState(seed)
  stepCrowds(crowds, { position: drone.position, heading: 0 }, 0)
  let size = startSize
  let absorbed = 0
  const input: DroneInput = { throttle: 1, steer: 0, strafe: 0, lookPitch: 0, vertical: 0, special: false }
  const dt = 1 / 60
  let state = drone
  for (let frame = 0; frame < seconds * 60; frame += 1) {
    const profile = sizeProfile(size)
    state = stepDrone(state, input, dt, profile.drag, UPGRADES)
    state.position.y = 3.2
    const threats = [{ ...state.position }]
    stepCrowds(crowds, { position: state.position, heading: state.heading, threats, crowdThreatStart: 1 }, dt)
    const field: BeamField = {
      active: true, boosting: false,
      position: state.position, velocity: state.velocity,
      radiusScale: profile.beamScale,
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
function averageFeed(seconds: number, startSize = SIZE_START) {
  const seeds = [4242, 9137, 31, 77021, 555, 12345]
  let total = 0
  for (const seed of seeds) total += flyAndFeed(seconds, startSize, seed).absorbed
  return total / seeds.length
}

describe('feeding is the core loop', () => {
  it('a competent low pass keeps the craft fed', () => {
    const average = averageFeed(25)
    console.log('absorbed per 25s pass:', average)
    // Enough that a clean run grows, but not so many that the beam vacuums a
    // whole block without the player aiming it.
    expect(average).toBeGreaterThanOrEqual(6)
  })

  it('feeding outpaces a steady trickle of chip damage', () => {
    // If a run cannot out-feed routine hits, size only ever goes down and the
    // growth loop is decorative.
    const average = averageFeed(25)
    const gained = average * SIZE_GAIN.pedestrian
    const rifleHitsSurvived = gained / SIZE_LOSS.rifle
    expect(rifleHitsSurvived).toBeGreaterThan(3)
  })

  it('a bigger craft feeds faster, because the beam widened', () => {
    const small = averageFeed(18, SIZE_START)
    const big = averageFeed(18, 2.4)
    expect(big).toBeGreaterThan(small)
  })
})

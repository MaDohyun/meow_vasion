import { describe, expect, it } from 'vitest'
import {
  CAMERA_GROWTH_PULL_BACK,
  CAMERA_REST_DISTANCE,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_START,
  ABSORB_DISTANCE_MAX,
  clampSize,
  growSize,
  growSizeBy,
  maxAltitude,
  sizeProfile,
  sizeCameraLift,
  ufoDiameter,
} from '../src/core/size'

describe('craft size as growth, not as health', () => {
  it('starts small enough that one person is a real meal', () => {
    // About three people wide. The old start was five metres across, which is
    // a car - swallowing a pedestrian at that size is housekeeping, not a meal.
    expect(ufoDiameter(SIZE_START)).toBeLessThan(3)
    expect(ufoDiameter(SIZE_START)).toBeGreaterThan(1.5)
    // And there is a whole run's worth of room above it.
    expect(SIZE_MAX / SIZE_START).toBeGreaterThan(20)
  })

  it('never falls, whatever happens', () => {
    // Size stopped being health. A hit that shrank the craft was rewinding the
    // best part of the game, and once shots could actually land it turned
    // growing into a spiral: bigger target, more hits, smaller craft.
    expect(clampSize(SIZE_START - 5)).toBe(SIZE_MIN)
    expect(growSize(SIZE_START, 'cat')).toBeGreaterThan(SIZE_START)
    expect(growSizeBy(SIZE_START, 0)).toBe(SIZE_START)
  })

  it('opens the world up as it grows', () => {
    // Height, view and camera all widen with size. A grown craft would not fit
    // between the towers anyway, so the sky opening up is less a reward than a
    // change of scenery - and it needs to see further because it is up there
    // covering ground faster.
    const start = sizeProfile(SIZE_START)
    const big = sizeProfile(SIZE_MAX)
    expect(big.maxAltitude).toBeGreaterThan(start.maxAltitude)
    expect(big.viewDistance).toBeGreaterThan(start.viewDistance)
    // Even the smallest craft has to clear the low-rise band, or it cannot
    // move through the city at all.
    expect(start.maxAltitude).toBeGreaterThan(20)
    // Altitude rises with size at every step, never dips.
    let previous = 0
    for (let size = SIZE_START; size <= SIZE_MAX; size += 0.2) {
      const altitude = maxAltitude(size)
      expect(altitude).toBeGreaterThanOrEqual(previous)
      previous = altitude
    }
  })

  it('grows strength and lift without secretly widening the beam', () => {
    const start = sizeProfile(SIZE_START)
    const big = sizeProfile(SIZE_MAX)
    expect(big.beamScale).toBe(start.beamScale)
    expect(big.beamPower).toBeGreaterThan(start.beamPower)
    expect(big.beamStrength).toBe(7)
    expect(big.liftCapacity).toBe(26)
    expect(big.absorbDistance).toBeGreaterThan(start.absorbDistance)
    expect(big.absorbDistance).toBe(ABSORB_DISTANCE_MAX)
    expect(big.scoreMultiplier).toBeGreaterThan(start.scoreMultiplier)
    // ...and pays only by being a bigger target. Speed is deliberately not a
    // cost of growth; that tax belongs to beam ballast instead.
    expect(big.hitRadius).toBeGreaterThan(start.hitRadius)
  })

  it('never charges speed for growing', () => {
    // Growth is what the player is good at. Taxing it directly punishes them
    // for succeeding, on a curve they cannot influence; the speed penalty lives
    // on hanging ballast, which is answerable with beam discipline.
    expect('drag' in sizeProfile(SIZE_MAX)).toBe(false)
  })

  it('pulls the camera back by half again per doubling, not by double', () => {
    // The camera used to retreat faster than the craft grew, so growing changed
    // the picture without ever making the player feel bigger - which is the one
    // thing the run is about. Asserted as the ratio rather than as distances so
    // retuning the rest distance cannot quietly undo it.
    for (const size of [0.7, 1, 1.4]) {
      expect(sizeProfile(size * 2).cameraDistance / sizeProfile(size).cameraDistance)
        .toBeCloseTo(CAMERA_GROWTH_PULL_BACK, 6)
    }
    // Growing still pulls back - it just loses the race with the hull, which is
    // what puts more saucer on screen the bigger it gets.
    expect(sizeProfile(SIZE_MAX).cameraDistance).toBeGreaterThan(sizeProfile(SIZE_START).cameraDistance)
    expect(CAMERA_GROWTH_PULL_BACK).toBeLessThan(2)
    // The rest distance is the rig at size 1; the opening saucer is smaller
    // than that, so the camera starts in closer - which is the whole point of
    // starting small.
    expect(sizeProfile(1).cameraDistance).toBeCloseTo(CAMERA_REST_DISTANCE)
    expect(sizeProfile(SIZE_START).cameraDistance).toBeLessThan(CAMERA_REST_DISTANCE)
    expect(ufoDiameter(SIZE_MAX) / 3).toBeGreaterThan(5)
  })

  it('raises the camera gently at first and more at the largest hull', () => {
    expect(sizeCameraLift(SIZE_START)).toBe(0)
    expect(sizeCameraLift(4)).toBeGreaterThan(sizeCameraLift(1))
    expect(sizeCameraLift(SIZE_MAX)).toBeGreaterThan(sizeCameraLift(4))
    expect(sizeCameraLift(SIZE_MAX)).toBeLessThan(8)
  })

  it('keeps the absorption window inside the fixed beam cone at every size', () => {
    let previous = 0
    for (let size = SIZE_START; size <= SIZE_MAX; size += 0.2) {
      const distance = sizeProfile(size).absorbDistance
      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThanOrEqual(ABSORB_DISTANCE_MAX)
      expect(distance).toBeGreaterThanOrEqual(previous)
      previous = distance
    }
  })



  it('reports ratio from the death threshold, not from zero', () => {
    expect(sizeProfile(SIZE_MIN).ratio).toBe(0)
    expect(sizeProfile(SIZE_MAX).ratio).toBe(1)
  })
})

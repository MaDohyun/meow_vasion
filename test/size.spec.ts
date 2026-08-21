import { describe, expect, it } from 'vitest'
import {
  SIZE_MAX,
  SIZE_MIN,
  SIZE_START,
  clampSize,
  growSize,
  isSizeFatal,
  shrinkSize,
  sizeProfile,
  ufoDiameter,
} from '../src/core/size'

describe('craft size as the only resource', () => {
  it('starts close enough to collapse that the first minute has tension', () => {
    expect(SIZE_START).toBeGreaterThan(SIZE_MIN)
    expect(SIZE_START - SIZE_MIN).toBeLessThan(0.45)
    expect(isSizeFatal(SIZE_START)).toBe(false)
    expect(isSizeFatal(SIZE_MIN - 0.001)).toBe(true)
  })

  it('trades reach for agility as it grows', () => {
    const start = sizeProfile(SIZE_START)
    const big = sizeProfile(SIZE_MAX)
    // Growing buys beam and score...
    expect(big.beamScale).toBeGreaterThan(start.beamScale)
    expect(big.beamPower).toBeGreaterThan(start.beamPower)
    expect(big.absorbDistance).toBeGreaterThan(start.absorbDistance)
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

  it('pulls the camera back as the craft grows', () => {
    expect(sizeProfile(SIZE_MAX).cameraDistance).toBeGreaterThan(sizeProfile(SIZE_START).cameraDistance * 4)
    expect(ufoDiameter(SIZE_MAX) / 3).toBeGreaterThan(5)
  })

  it('grows on absorption and shrinks on hits, clamped at the top', () => {
    expect(growSize(SIZE_START, 'cat')).toBeGreaterThan(growSize(SIZE_START, 'pedestrian'))
    expect(growSize(SIZE_MAX, 'cat')).toBe(SIZE_MAX)
    expect(shrinkSize(SIZE_START, 'missile')).toBeLessThan(shrinkSize(SIZE_START, 'rifle'))
    // The explosive pickup is the single most expensive mistake available.
    expect(shrinkSize(SIZE_START, 'explosive')).toBeLessThan(shrinkSize(SIZE_START, 'missile'))
    expect(clampSize(-5)).toBe(0)
  })

  it('uses the doubled feeding pace without making one person erase a missile', () => {
    let size = shrinkSize(SIZE_START, 'missile')
    let absorbed = 0
    while (size < SIZE_START) {
      size = growSize(size, 'pedestrian')
      absorbed += 1
    }
    expect(absorbed).toBeGreaterThanOrEqual(2)
    expect(absorbed).toBeLessThanOrEqual(4)
  })

  it('reports ratio from the death threshold, not from zero', () => {
    expect(sizeProfile(SIZE_MIN).ratio).toBe(0)
    expect(sizeProfile(SIZE_MAX).ratio).toBe(1)
  })
})

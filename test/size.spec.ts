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
} from '../src/core/size'

describe('craft size as the only resource', () => {
  it('starts close enough to collapse that the first minute has tension', () => {
    expect(SIZE_START).toBeGreaterThan(SIZE_MIN)
    expect(SIZE_START - SIZE_MIN).toBeLessThan(0.45)
    expect(isSizeFatal(SIZE_START)).toBe(false)
    expect(isSizeFatal(SIZE_MIN - 0.001)).toBe(true)
  })

  it('trades reach for agility as it grows', () => {
    const small = sizeProfile(SIZE_MIN)
    const start = sizeProfile(SIZE_START)
    const big = sizeProfile(SIZE_MAX)
    // Growing buys beam and score...
    expect(big.beamScale).toBeGreaterThan(start.beamScale)
    expect(big.beamPower).toBeGreaterThan(start.beamPower)
    expect(big.absorbDistance).toBeGreaterThan(start.absorbDistance)
    expect(big.scoreMultiplier).toBeGreaterThan(start.scoreMultiplier)
    // ...and pays in handling and in being a bigger target.
    expect(big.drag).toBeGreaterThan(start.drag)
    expect(big.hitRadius).toBeGreaterThan(start.hitRadius)
  })

  it('makes a shrunken craft faster, so a bad hit is recoverable', () => {
    // Negative drag is the whole point: without it, small means weak beam AND
    // sluggish, which is an unrecoverable spiral.
    expect(sizeProfile(SIZE_MIN).drag).toBeLessThan(0)
    expect(sizeProfile(SIZE_START).drag).toBe(0)
  })

  it('pulls the camera back as the craft grows', () => {
    expect(sizeProfile(SIZE_MAX).cameraDistance).toBeGreaterThan(sizeProfile(SIZE_START).cameraDistance)
  })

  it('grows on absorption and shrinks on hits, clamped at the top', () => {
    expect(growSize(SIZE_START, 'cat')).toBeGreaterThan(growSize(SIZE_START, 'pedestrian'))
    expect(growSize(SIZE_MAX, 'cat')).toBe(SIZE_MAX)
    expect(shrinkSize(SIZE_START, 'missile')).toBeLessThan(shrinkSize(SIZE_START, 'rifle'))
    // The explosive pickup is the single most expensive mistake available.
    expect(shrinkSize(SIZE_START, 'explosive')).toBeLessThan(shrinkSize(SIZE_START, 'missile'))
    expect(clampSize(-5)).toBe(0)
  })

  it('needs a real feeding streak to recover a heavy hit', () => {
    // A missile should cost several bodies, or damage stops mattering.
    let size = shrinkSize(SIZE_START, 'missile')
    let absorbed = 0
    while (size < SIZE_START) {
      size = growSize(size, 'pedestrian')
      absorbed += 1
    }
    expect(absorbed).toBeGreaterThanOrEqual(4)
    expect(absorbed).toBeLessThanOrEqual(8)
  })

  it('reports ratio from the death threshold, not from zero', () => {
    expect(sizeProfile(SIZE_MIN).ratio).toBe(0)
    expect(sizeProfile(SIZE_MAX).ratio).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { MYSTERY_BOOST_DURATION, MYSTERY_BOOST_MAX_MULTIPLIER, mysteryBoostMultiplier } from '../src/core/mysteryCircles'

describe('mystery-circle surge', () => {
  it('starts at full speed and fades to normal over five seconds', () => {
    expect(mysteryBoostMultiplier(MYSTERY_BOOST_DURATION)).toBe(MYSTERY_BOOST_MAX_MULTIPLIER)
    expect(mysteryBoostMultiplier(0)).toBe(1)
    expect(mysteryBoostMultiplier(MYSTERY_BOOST_DURATION / 2)).toBe(1.6)
    expect(mysteryBoostMultiplier(-2)).toBe(1)
  })
})

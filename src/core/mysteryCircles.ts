export const MYSTERY_BOOST_DURATION = 5
export const MYSTERY_BOOST_MAX_MULTIPLIER = 2.2

/** Speed multiplier while a mystery-circle surge is active or fading. */
export function mysteryBoostMultiplier(remaining: number) {
  const progress = Math.max(0, Math.min(1, remaining / MYSTERY_BOOST_DURATION))
  return 1 + (MYSTERY_BOOST_MAX_MULTIPLIER - 1) * progress
}

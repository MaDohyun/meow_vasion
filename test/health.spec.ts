import { describe, expect, it } from 'vitest'
import {
  HEALTH_LOSS,
  MAX_HEALTH,
  REGEN_DELAY,
  createHealthState,
  damageHealth,
  healHealth,
  healthRatio,
  isDead,
  isRegenerating,
  stepHealth,
} from '../src/core/health'
import { SIZE_GAIN, SIZE_MAX, SIZE_MIN, SIZE_START, clampSize, growSize } from '../src/core/size'

describe('health as the survival resource', () => {
  it('starts full and ends the run only at zero', () => {
    const state = createHealthState()
    expect(state.current).toBe(MAX_HEALTH)
    expect(isDead(state)).toBe(false)
    for (let hit = 0; hit < 40; hit += 1) damageHealth(state, 'missile')
    expect(state.current).toBe(0)
    expect(isDead(state)).toBe(true)
    expect(healthRatio(state)).toBe(0)
  })

  it('charges most for the things you could have seen coming', () => {
    // Inherited from the size losses this replaced, and the reason is
    // unchanged: being surprised must never be the expensive mistake, because
    // no skill answers it.
    expect(HEALTH_LOSS.explosive).toBeGreaterThan(HEALTH_LOSS.missile)
    expect(HEALTH_LOSS.missile).toBeGreaterThan(HEALTH_LOSS.shell)
    expect(HEALTH_LOSS.shell).toBeGreaterThanOrEqual(HEALTH_LOSS.contact)
    expect(HEALTH_LOSS.contact).toBeGreaterThan(HEALTH_LOSS.rifle)
    // Clipping a building is a mistake, not a catastrophe.
    expect(HEALTH_LOSS.building).toBeLessThan(HEALTH_LOSS.shell)
  })

  it('waits before healing, and every hit restarts the wait', () => {
    // Disengaging has to be a decision with a cost. If it patched up straight
    // away, backing off would be free and there would be no reason to weigh it.
    const state = createHealthState()
    damageHealth(state, 'shell')
    const wounded = state.current
    stepHealth(state, REGEN_DELAY - 0.5)
    expect(state.current).toBe(wounded)
    expect(isRegenerating(state)).toBe(false)

    stepHealth(state, 2)
    expect(state.current).toBeGreaterThan(wounded)
    expect(isRegenerating(state)).toBe(true)

    damageHealth(state, 'rifle')
    expect(state.sinceHit).toBe(0)
    stepHealth(state, REGEN_DELAY - 0.5)
    expect(isRegenerating(state)).toBe(false)
  })

  it('never heals past full, and the regen upgrade actually speeds it up', () => {
    const slow = createHealthState()
    const fast = createHealthState()
    damageHealth(slow, 'explosive')
    damageHealth(fast, 'explosive')
    stepHealth(slow, REGEN_DELAY + 4)
    stepHealth(fast, REGEN_DELAY + 4, 2)
    expect(fast.current).toBeGreaterThan(slow.current)

    const full = createHealthState()
    healHealth(full, 99)
    stepHealth(full, 999)
    expect(full.current).toBe(MAX_HEALTH)
    expect(isRegenerating(full)).toBe(false)
  })

  it('leaves size out of it entirely', () => {
    // The point of the split. Size used to be health, which meant a hit undid
    // the best part of the game and - once shots could land - turned growing
    // into a spiral: bigger target, more hits, smaller craft.
    let size = SIZE_START
    const state = createHealthState()
    for (let hit = 0; hit < 20; hit += 1) {
      damageHealth(state, 'explosive')
      expect(size).toBe(SIZE_START)
    }
    size = growSize(size, 'pedestrian')
    expect(size).toBeGreaterThan(SIZE_START)
    expect(clampSize(SIZE_START - 99)).toBe(SIZE_MIN)
  })

  it('is survivable long enough to be worth playing around', () => {
    // Five pips against rifle fire is roughly ten hits; against the heaviest
    // thing in the game it is two. Both should feel like a budget rather than
    // a formality.
    expect(MAX_HEALTH / HEALTH_LOSS.rifle).toBeGreaterThanOrEqual(8)
    expect(MAX_HEALTH / HEALTH_LOSS.explosive).toBeGreaterThanOrEqual(2)
  })

  it('leaves the growth ceiling reachable', () => {
    // Sanity on the other resource: proportional growth has to be able to span
    // the range, or the ceiling is decoration.
    const absorptions = Math.log(SIZE_MAX / SIZE_START) / Math.log(1 + SIZE_GAIN.pedestrian)
    expect(absorptions).toBeGreaterThan(60)
    expect(absorptions).toBeLessThan(180)
  })
})

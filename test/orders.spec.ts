import { describe, expect, it } from 'vitest'
import { generateOrder } from '../src/core/orders'

describe('order generator', () => {
  it('is deterministic', () => {
    expect(generateOrder(42, 3)).toEqual(generateOrder(42, 3))
  })

  it('only generates reachable order timers', () => {
    for (let seed = 0; seed < 1000; seed += 1) {
      const order = generateOrder(seed, 5)
      const distance = Math.hypot(
        order.destination.position.x - order.pickup.position.x,
        order.destination.position.z - order.pickup.position.z,
      )
      expect(order.timeLimit).toBeGreaterThan(distance / 14 + 6)
      expect(order.cargoCount).toBeGreaterThanOrEqual(2)
      expect(order.cargoCount).toBeLessThanOrEqual(6)
    }
  })
})

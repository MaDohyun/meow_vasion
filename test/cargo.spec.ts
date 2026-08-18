import { describe, expect, it } from 'vitest'
import { createCargo, detachFromImpact, updateCargoStability } from '../src/core/cargo'

describe('cargo stability', () => {
  it('drains upper layers faster than lower layers', () => {
    const result = updateCargoStability(createCargo(4), {
      horizontalAcceleration: 8,
      angularVelocity: 1,
      tiltDegrees: 18,
      verticalAccelerationSpike: 2,
      calm: false,
    }, 0.05)
    expect(result.cargo[3]!.stability).toBeLessThan(result.cargo[0]!.stability)
  })

  it('recovers during calm flight without exceeding one', () => {
    const cargo = createCargo(1)
    cargo[0]!.stability = 0.5
    const result = updateCargoStability(cargo, {
      horizontalAcceleration: 0,
      angularVelocity: 0,
      tiltDegrees: 0,
      verticalAccelerationSpike: 0,
      calm: true,
    }, 0.5)
    expect(result.cargo[0]!.stability).toBeGreaterThan(0.5)
    expect(result.cargo[0]!.stability).toBeLessThanOrEqual(1)
  })

  it('drops from the top and respects magnetic reduction', () => {
    const cargo = createCargo(6)
    const normal = detachFromImpact(cargo, 8)
    const magnetic = detachFromImpact(cargo, 8, 1)
    expect(normal.detached).toHaveLength(2)
    expect(normal.detached.map((box) => box.id)).toEqual([4, 5])
    expect(magnetic.detached).toHaveLength(1)
  })
})

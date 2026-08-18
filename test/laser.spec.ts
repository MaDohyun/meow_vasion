import { describe, expect, it } from 'vitest'
import {
  LASER_MAX_PROJECTILES,
  createLaserPool,
  fireLaserProjectile,
  laserDirection,
  laserRisingEdge,
  stepLaserProjectiles,
} from '../src/core/laser'

describe('single-shot pooled laser projectiles', () => {
  it('fires only on the rising edge of keyboard or mobile hold state', () => {
    expect(laserRisingEdge(true, false)).toBe(true)
    expect(laserRisingEdge(true, true)).toBe(false)
    expect(laserRisingEdge(false, true)).toBe(false)
    expect(laserRisingEdge(true, false)).toBe(true)
  })

  it('reuses a fixed projectile pool', () => {
    const pool = createLaserPool()
    const direction = laserDirection(0, 0)
    for (let shot = 0; shot < LASER_MAX_PROJECTILES + 5; shot += 1) {
      fireLaserProjectile(pool, { x: 0, y: 2, z: 0 }, direction, { x: 0, y: 0, z: 0 })
    }
    expect(pool).toHaveLength(LASER_MAX_PROJECTILES)
    expect(pool.filter((projectile) => projectile.active)).toHaveLength(LASER_MAX_PROJECTILES)
  })

  it('advances and removes projectiles on impact or lifetime expiry', () => {
    const pool = createLaserPool()
    fireLaserProjectile(pool, { x: 0, y: 2, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })
    const collider = [{ minX: 5, maxX: 9, minY: 0, maxY: 5, minZ: -2, maxZ: 2 }]
    for (let frame = 0; frame < 10; frame += 1) stepLaserProjectiles(pool, collider, 1 / 60)
    expect(pool.some((projectile) => projectile.active)).toBe(false)

    fireLaserProjectile(pool, { x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 })
    for (let frame = 0; frame < 90; frame += 1) stepLaserProjectiles(pool, [], 1 / 60)
    expect(pool.some((projectile) => projectile.active)).toBe(false)
  })
})

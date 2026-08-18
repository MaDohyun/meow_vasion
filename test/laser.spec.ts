import { describe, expect, it } from 'vitest'
import {
  LASER_MAX_PROJECTILES,
  LASER_MAX_BURSTS,
  createLaserBurstPool,
  createLaserPool,
  fireLaserProjectile,
  laserDirection,
  laserRisingEdge,
  resolveLaserAim,
  stepLaserBursts,
  stepLaserProjectiles,
  triggerLaserBurst,
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
    for (let frame = 0; frame < 10; frame += 1) stepLaserProjectiles(pool, { colliders: collider }, 1 / 60)
    expect(pool.some((projectile) => projectile.active)).toBe(false)

    fireLaserProjectile(pool, { x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 })
    for (let frame = 0; frame < 240; frame += 1) stepLaserProjectiles(pool, { colliders: [] }, 1 / 60)
    expect(pool.some((projectile) => projectile.active)).toBe(false)
  })

  it('selects the closest real cursor-ray target and blocks fighters behind buildings', () => {
    const ray = { origin: { x: 0, y: 3, z: 0 }, direction: { x: 0, y: 0, z: 1 } }
    const building = [{ minX: -2, maxX: 2, minY: 0, maxY: 8, minZ: 20, maxZ: 25 }]
    const fighter = [{ id: 'fighter:0', kind: 'fighter' as const, center: { x: 0, y: 3, z: 30 }, radius: 2 }]
    const blocked = resolveLaserAim(ray, building, fighter)
    expect(blocked.targetKind).toBe('building')
    expect(blocked.distance).toBeCloseTo(20)

    const visible = resolveLaserAim(ray, [], fighter)
    expect(visible.targetId).toBe('fighter:0')
    expect(visible.distance).toBeCloseTo(28)
  })

  it('uses only the leading-tip segment for projectile hits', () => {
    const pool = createLaserPool()
    fireLaserProjectile(pool, { x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 })
    const behind = [{ minX: -1, maxX: 1, minY: 0, maxY: 5, minZ: -10, maxZ: -5 }]
    const impacts = stepLaserProjectiles(pool, { colliders: behind }, 1 / 60)
    expect(impacts).toHaveLength(0)
    expect(pool[0]?.active).toBe(true)
  })

  it('reuses fixed muzzle and impact burst slots', () => {
    const bursts = createLaserBurstPool()
    for (let index = 0; index < LASER_MAX_BURSTS + 3; index += 1) {
      triggerLaserBurst(bursts, index % 2 ? 'muzzle' : 'impact', { x: index, y: 1, z: 0 })
    }
    expect(bursts).toHaveLength(LASER_MAX_BURSTS)
    expect(bursts.every((burst) => burst.active)).toBe(true)
    for (let frame = 0; frame < 10; frame += 1) stepLaserBursts(bursts, 0.05)
    expect(bursts.every((burst) => !burst.active)).toBe(true)
  })
})

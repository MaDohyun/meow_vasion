import { describe, expect, it } from 'vitest'
import {
  LASER_MAX_PROJECTILES,
  LASER_MAX_BURSTS,
  createLaserBurstPool,
  createLaserPool,
  fireLaserBeam,
  laserDirection,
  laserRisingEdge,
  resolveLaserAim,
  stepLaserBursts,
  stepLaserProjectiles,
  triggerLaserBurst,
} from '../src/core/laser'

describe('single-shot pooled hitscan laser beams', () => {
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
      fireLaserBeam(pool, { x: 0, y: 2, z: 0 }, { x: direction.x * 100, y: 2, z: direction.z * 100 })
    }
    expect(pool).toHaveLength(LASER_MAX_PROJECTILES)
    expect(pool.filter((projectile) => projectile.active)).toHaveLength(LASER_MAX_PROJECTILES)
  })

  it('instantly stores the full muzzle-to-hit segment', () => {
    const pool = createLaserPool()
    const beam = fireLaserBeam(pool, { x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 100 })
    expect(beam.velocity).toEqual({ x: 0, y: 0, z: 0 })
    expect(beam.direction).toEqual({ x: 0, y: 0, z: 1 })
    expect(beam.position.z + beam.distance).toBeCloseTo(100)
  })

  it('keeps the beam briefly visible and then returns its pool slot', () => {
    const pool = createLaserPool()
    fireLaserBeam(pool, { x: 0, y: 2, z: 0 }, { x: 50, y: 2, z: 0 })
    stepLaserProjectiles(pool, 0.05)
    expect(pool.some((projectile) => projectile.active)).toBe(true)
    for (let frame = 0; frame < 4; frame += 1) stepLaserProjectiles(pool, 0.05)
    expect(pool.some((projectile) => projectile.active)).toBe(false)
  })

  it('selects the closest real cursor-ray target and blocks fighters behind buildings', () => {
    const ray = { origin: { x: 0, y: 3, z: 0 }, direction: { x: 0, y: 0, z: 1 } }
    const building = [{ id: 'building:0:0', minX: -2, maxX: 2, minY: 0, maxY: 8, minZ: 20, maxZ: 25 }]
    const fighter = [{ id: 'fighter:0', kind: 'fighter' as const, center: { x: 0, y: 3, z: 30 }, radius: 2 }]
    const blocked = resolveLaserAim(ray, building, fighter)
    expect(blocked.targetKind).toBe('building')
    expect(blocked.targetId).toBe('building:0:0')
    expect(blocked.distance).toBeCloseTo(20)

    const visible = resolveLaserAim(ray, [], fighter)
    expect(visible.targetId).toBe('fighter:0')
    expect(visible.distance).toBeCloseTo(28)
  })

  it('resolves pedestrians and street furniture as their own target kinds', () => {
    // A person is a small sphere near the ground; a shot angled down at one
    // has to land on the person, not on the pavement behind them.
    const downRay = { origin: { x: 0, y: 6, z: 0 }, direction: { x: 0, y: -0.2, z: 1 } }
    const person = [{ id: 'crowd:pedestrian:0:1', kind: 'person' as const, center: { x: 0, y: 0.65, z: 24 }, radius: 0.75 }]
    const personAim = resolveLaserAim(downRay, [], person)
    expect(personAim.targetKind).toBe('person')
    expect(personAim.targetId).toBe('crowd:pedestrian:0:1')

    const flatRay = { origin: { x: 0, y: 3, z: 0 }, direction: { x: 0, y: 0, z: 1 } }
    const lamp = [{ id: 'utility-pole:1:2:0', kind: 'prop' as const, center: { x: 0, y: 2.2, z: 18 }, radius: 2.5 }]
    const propAim = resolveLaserAim(flatRay, [], lamp)
    expect(propAim.targetKind).toBe('prop')
    expect(propAim.targetId).toBe('utility-pole:1:2:0')
  })

  it('draws exactly to the already-resolved hit point', () => {
    const pool = createLaserPool()
    const aim = resolveLaserAim(
      { origin: { x: 0, y: 3, z: 0 }, direction: { x: 0, y: 0, z: 1 } },
      [{ minX: -1, maxX: 1, minY: 0, maxY: 5, minZ: 25, maxZ: 30 }],
    )
    const beam = fireLaserBeam(pool, { x: 0, y: 3, z: 0 }, aim.point)
    expect(beam.position.z + beam.distance).toBeCloseTo(25)
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

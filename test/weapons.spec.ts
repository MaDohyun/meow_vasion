import { describe, expect, it } from 'vitest'
import {
  WEAPON_DEFINITIONS,
  WEAPON_POOL_CAPS,
  activeWeaponProjectileCount,
  createWeaponState,
  equipWeapon,
  nearestWeaponTarget,
  stepWeapons,
  type WeaponTarget,
} from '../src/core/weapons'

function target(id: string, z: number, radius = 1): WeaponTarget {
  return { id, center: { x: 0, y: 3, z }, radius }
}

describe('automatic weapon system', () => {
  it('keeps data-driven definitions and fixed per-kind pools', () => {
    const state = createWeaponState('homing-missile')
    expect(Object.keys(WEAPON_DEFINITIONS)).toHaveLength(4)
    expect(state.projectiles.filter((projectile) => projectile.kind === 'missile')).toHaveLength(WEAPON_POOL_CAPS.missile)
    expect(state.projectiles.filter((projectile) => projectile.kind === 'scatter')).toHaveLength(WEAPON_POOL_CAPS.scatter)
    expect(state.projectiles.filter((projectile) => projectile.kind === 'satellite')).toHaveLength(WEAPON_POOL_CAPS.satellite)
    expect(state.projectiles.filter((projectile) => projectile.kind === 'bomb')).toHaveLength(WEAPON_POOL_CAPS.bomb)
  })

  it('finds the nearest target without sorting the target list', () => {
    const targets = [target('far', 60), target('near', 12), target('out', 200)]
    expect(nearestWeaponTarget(targets, { x: 0, y: 3, z: 0 }, 80)?.id).toBe('near')
    expect(nearestWeaponTarget(targets, { x: 0, y: 3, z: 0 }, 5)).toBeNull()
  })

  it('automatically launches a locked homing missile and applies damage on contact', () => {
    const state = createWeaponState('homing-missile')
    const targets = [target('drone:0', 8)]
    const hits: string[] = []
    stepWeapons(state, { position: { x: 0, y: 3, z: 0 }, heading: 0, pitch: 0, targets }, 0, (id) => hits.push(id))
    expect(activeWeaponProjectileCount(state, 'missile')).toBe(1)
    for (let frame = 0; frame < 12; frame += 1) stepWeapons(state, { position: { x: 0, y: 3, z: 0 }, heading: 0, pitch: 0, targets }, 0.05, (id) => hits.push(id))
    expect(hits).toContain('drone:0')
  })

  it('activates orbit satellites and keeps multiple weapons automatic', () => {
    const state = createWeaponState('orbit-satellite')
    equipWeapon(state, 'scatter-burst')
    const targets = [target('drone:0', 4, 2)]
    stepWeapons(state, { position: { x: 0, y: 3, z: 0 }, heading: 0, pitch: 0, targets }, 0, () => undefined)
    expect(activeWeaponProjectileCount(state, 'satellite')).toBe(3)
    expect(activeWeaponProjectileCount(state, 'scatter')).toBe(8)
  })

  it('drops a bomb that deals area damage at ground level', () => {
    const state = createWeaponState('drop-bomb')
    const targets = [target('police:0', 1, 1)]
    const hits: string[] = []
    for (let frame = 0; frame < 8; frame += 1) stepWeapons(state, { position: { x: 0, y: 3, z: 0 }, heading: 0, pitch: 0, targets }, 0.05, (id) => hits.push(id))
    expect(hits).toContain('police:0')
  })
})

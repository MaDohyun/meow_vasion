import { describe, expect, it } from 'vitest'
import {
  ENEMY_CAPS,
  ENEMY_MAX_HP,
  activeEnemyCount,
  createEnemyState,
  hitEnemy,
  isAntiAirBuilding,
  syncAntiAirEnemies,
  syncEnemyTiers,
} from '../src/core/enemies'
import { getProceduralCell, type ProceduralBuilding } from '../src/core/world'

function antiAirBuildings(count: number) {
  const result: ProceduralBuilding[] = []
  for (let z = -40; z <= 40 && result.length < count; z += 1) {
    for (let x = -40; x <= 40 && result.length < count; x += 1) {
      const building = getProceduralCell(x, z).building
      if (building && isAntiAirBuilding(building)) result.push(building)
    }
  }
  return result
}

describe('fixed cumulative enemy tiers', () => {
  it('activates each fixed pool cumulatively without growing allocations', () => {
    const state = createEnemyState()
    const slotCount = state.slots.length
    const player = { x: 10, y: 4, z: 20 }

    syncEnemyTiers(state, 1, player, 0, 1 / 60)
    expect(activeEnemyCount(state, 'soldier')).toBe(ENEMY_CAPS.soldier)
    expect(activeEnemyCount(state, 'helicopter')).toBe(0)

    syncEnemyTiers(state, 5, player, 0, 1 / 60)
    expect(activeEnemyCount(state, 'soldier')).toBe(8)
    expect(activeEnemyCount(state, 'helicopter')).toBe(3)
    expect(activeEnemyCount(state, 'fighter')).toBe(3)
    expect(activeEnemyCount(state, 'balloon')).toBe(1)
    expect(state.slots).toHaveLength(slotCount)
  })

  it('tracks HP per target instead of sharing damage across a tier', () => {
    const state = createEnemyState()
    syncEnemyTiers(state, 4, { x: 0, y: 5, z: 0 }, 0, 1 / 60)
    const fighters = state.slots.filter((enemy) => enemy.kind === 'fighter' && enemy.active)
    expect(fighters[0]?.hp).toBe(ENEMY_MAX_HP.fighter)
    for (let hit = 0; hit < 3; hit += 1) expect(hitEnemy(state, fighters[0]!.id).destroyed).toBe(false)
    expect(fighters[0]?.hp).toBe(1)
    expect(fighters[1]?.hp).toBe(ENEMY_MAX_HP.fighter)
    expect(hitEnemy(state, fighters[0]!.id).destroyed).toBe(true)
    expect(activeEnemyCount(state, 'fighter')).toBe(2)
  })

  it('places deterministic anti-air units on eligible buildings at tier three', () => {
    const buildings = antiAirBuildings(ENEMY_CAPS['anti-air'] + 3)
    expect(buildings.length).toBeGreaterThanOrEqual(ENEMY_CAPS['anti-air'])
    const first = createEnemyState()
    const second = createEnemyState()
    syncAntiAirEnemies(first, 2, buildings)
    expect(activeEnemyCount(first, 'anti-air')).toBe(0)
    syncAntiAirEnemies(first, 3, buildings)
    syncAntiAirEnemies(second, 3, buildings)
    const sources = first.slots.filter((enemy) => enemy.active && enemy.kind === 'anti-air').map((enemy) => enemy.sourceId)
    expect(sources).toEqual(second.slots.filter((enemy) => enemy.active && enemy.kind === 'anti-air').map((enemy) => enemy.sourceId))
    expect(sources).toHaveLength(ENEMY_CAPS['anti-air'])
  })

  it('does not respawn a destroyed anti-air unit during the session', () => {
    const buildings = antiAirBuildings(2)
    const state = createEnemyState()
    syncAntiAirEnemies(state, 3, buildings)
    const target = state.slots.find((enemy) => enemy.kind === 'anti-air' && enemy.active)!
    for (let hit = 0; hit < ENEMY_MAX_HP['anti-air']; hit += 1) hitEnemy(state, target.id)
    expect(state.destroyedAntiAir.has(target.sourceId!)).toBe(true)
    syncAntiAirEnemies(state, 3, buildings)
    expect(state.slots.some((enemy) => enemy.active && enemy.sourceId === target.sourceId)).toBe(false)
  })

  it('spawns mobile pools behind the current view direction', () => {
    const state = createEnemyState()
    const player = { x: 5, y: 3, z: -7 }
    syncEnemyTiers(state, 5, player, 0, 1 / 60)
    for (const enemy of state.slots.filter((slot) => slot.active)) {
      const forwardDot = enemy.position.z - player.z
      expect(forwardDot).toBeLessThan(0)
    }
  })
})

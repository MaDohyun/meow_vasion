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
  stepEnemies,
  waveStageForTime,
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

function fillWave(time: number) {
  const state = createEnemyState()
  const player = { x: 10, y: 14, z: 20 }
  for (let tick = 0; tick < 720; tick += 1) syncEnemyTiers(state, time, player, 0, 0.05)
  return { state, player }
}

describe('time-based enemy waves', () => {
  it('starts with only a couple of recon drones', () => {
    const state = createEnemyState()
    syncEnemyTiers(state, 0, { x: 0, y: 4, z: 0 }, 0, 1 / 60)
    expect(activeEnemyCount(state, 'drone')).toBe(2)
    expect(activeEnemyCount(state, 'police')).toBe(0)
    expect(waveStageForTime(20)).toBe(1)
  })

  it('escalates to a bounded mixed army and a single boss', () => {
    const { state } = fillWave(150)
    expect(activeEnemyCount(state, 'drone')).toBe(ENEMY_CAPS.drone)
    expect(activeEnemyCount(state, 'helicopter')).toBe(ENEMY_CAPS.helicopter)
    expect(activeEnemyCount(state, 'tank')).toBe(ENEMY_CAPS.tank)
    expect(activeEnemyCount(state, 'boss')).toBe(1)
    expect(state.slots.length).toBeLessThan(160)
  })

  it('keeps individual HP for large units', () => {
    const { state } = fillWave(150)
    const boss = state.slots.find((enemy) => enemy.kind === 'boss' && enemy.active)!
    expect(boss.hp).toBe(ENEMY_MAX_HP.boss)
    for (let hit = 0; hit < 24; hit += 1) expect(hitEnemy(state, boss.id).destroyed).toBe(false)
    expect(boss.hp).toBe(1)
    expect(hitEnemy(state, boss.id).destroyed).toBe(true)
  })

  it('enables deterministic anti-air sites only at the late high-altitude wave', () => {
    const buildings = antiAirBuildings(ENEMY_CAPS['anti-air'] + 2)
    const first = createEnemyState()
    const second = createEnemyState()
    syncAntiAirEnemies(first, 90, buildings)
    expect(activeEnemyCount(first, 'anti-air')).toBe(0)
    syncAntiAirEnemies(first, 110, buildings)
    syncAntiAirEnemies(second, 110, buildings)
    const sources = first.slots.filter((enemy) => enemy.active && enemy.kind === 'anti-air').map((enemy) => enemy.sourceId)
    expect(sources).toEqual(second.slots.filter((enemy) => enemy.active && enemy.kind === 'anti-air').map((enemy) => enemy.sourceId))
    expect(sources).toHaveLength(Math.min(5, buildings.length))
  })

  it('uses the fighter pool for repeated strafing runs instead of balloon pursuers', () => {
    const { state, player } = fillWave(95)
    const fighter = state.slots.find((enemy) => enemy.kind === 'fighter' && enemy.active)!
    const startX = fighter.position.x
    for (let tick = 0; tick < 20; tick += 1) {
      stepEnemies(state, player, 0.05)
    }
    expect(fighter.position.x).not.toBe(startX)
    expect(state.slots.some((enemy) => enemy.kind === ('balloon' as never))).toBe(false)
  })
})

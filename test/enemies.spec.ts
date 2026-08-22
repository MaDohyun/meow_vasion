import { describe, expect, it } from 'vitest'
import {
  ENEMY_CAPS,
  ENEMY_MAX_HP,
  ENEMY_WAVE_STAGES,
  activeEnemyCount,
  airBandForSlot,
  createEnemyState,
  hitEnemy,
  isAntiAirBuilding,
  isDroneMine,
  resolveEnemyContacts,
  stepEnemies,
  syncAntiAirEnemies,
  syncEnemyTiers,
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

// Wave times are data, not literals. They were respaced when the run went to
// five minutes, and every test that had pinned a number broke; naming them off
// the table means the next respacing carries the tests with it.
const MID_WAVE_AT = ENEMY_WAVE_STAGES[3]!.at
const FIGHTER_WAVE_AT = ENEMY_WAVE_STAGES[4]!.at
const AA_WAVE_AT = ENEMY_WAVE_STAGES[5]!.at
const LAST_WAVE_AT = ENEMY_WAVE_STAGES[ENEMY_WAVE_STAGES.length - 1]!.at

describe('time-based enemy waves', () => {
  it('starts with only a couple of recon drones', () => {
    const state = createEnemyState()
    syncEnemyTiers(state, 0, { x: 0, y: 4, z: 0 }, 0, 1 / 60)
    expect(activeEnemyCount(state, 'drone')).toBe(2)
    expect(activeEnemyCount(state, 'police')).toBe(0)
    expect(waveStageForTime(ENEMY_WAVE_STAGES[1]!.at)).toBe(1)
  })

  it('escalates to a bounded mixed army and a single boss', () => {
    const { state } = fillWave(LAST_WAVE_AT)
    expect(activeEnemyCount(state, 'drone')).toBe(ENEMY_CAPS.drone)
    expect(activeEnemyCount(state, 'helicopter')).toBe(ENEMY_CAPS.helicopter)
    expect(activeEnemyCount(state, 'tank')).toBe(ENEMY_CAPS.tank)
    expect(activeEnemyCount(state, 'boss')).toBe(1)
    expect(state.slots.length).toBeLessThan(160)
  })

  it('keeps individual HP for large units', () => {
    const { state } = fillWave(LAST_WAVE_AT)
    const boss = state.slots.find((enemy) => enemy.kind === 'boss' && enemy.active)!
    expect(boss.hp).toBe(ENEMY_MAX_HP.boss)
    for (let hit = 0; hit < ENEMY_MAX_HP.boss - 1; hit += 1) expect(hitEnemy(state, boss.id).destroyed).toBe(false)
    expect(boss.hp).toBe(1)
    expect(hitEnemy(state, boss.id).destroyed).toBe(true)
  })

  it('enables deterministic anti-air sites only at the late high-altitude wave', () => {
    const buildings = antiAirBuildings(ENEMY_CAPS['anti-air'] + 2)
    const first = createEnemyState()
    const second = createEnemyState()
    syncAntiAirEnemies(first, ENEMY_WAVE_STAGES[4]!.at, buildings)
    expect(activeEnemyCount(first, 'anti-air')).toBe(0)
    syncAntiAirEnemies(first, AA_WAVE_AT, buildings)
    syncAntiAirEnemies(second, AA_WAVE_AT, buildings)
    const sources = first.slots.filter((enemy) => enemy.active && enemy.kind === 'anti-air').map((enemy) => enemy.sourceId)
    expect(sources).toEqual(second.slots.filter((enemy) => enemy.active && enemy.kind === 'anti-air').map((enemy) => enemy.sourceId))
    expect(sources).toHaveLength(Math.min(5, buildings.length))
  })

  it('uses the fighter pool for repeated strafing runs instead of balloon pursuers', () => {
    const { state, player } = fillWave(FIGHTER_WAVE_AT)
    const fighter = state.slots.find((enemy) => enemy.kind === 'fighter' && enemy.active)!
    const startX = fighter.position.x
    for (let tick = 0; tick < 20; tick += 1) {
      stepEnemies(state, player, 0.05)
    }
    expect(fighter.position.x).not.toBe(startX)
    expect(state.slots.some((enemy) => enemy.kind === ('balloon' as never))).toBe(false)
  })

  it('keeps air units on their own heading instead of chasing the player', () => {
    const { state } = fillWave(MID_WAVE_AT)
    const player = { x: 10, y: 14, z: 20 }
    // Mines are excluded on purpose: they are supposed to sit still. This guards
    // the passing drones, which must cross and carry on rather than latch on.
    const drone = state.slots.find((enemy) => enemy.kind === 'drone' && enemy.active && !isDroneMine(enemy))!
    const startDistance = Math.hypot(drone.position.x - player.x, drone.position.z - player.z)
    const heading = drone.phase
    for (let tick = 0; tick < 120; tick += 1) stepEnemies(state, player, 1 / 60)
    // A chasing unit converges on the player and parks there. A travelling one
    // crosses the area and keeps going, so its distance must not settle.
    const endDistance = Math.hypot(drone.position.x - player.x, drone.position.z - player.z)
    expect(Math.abs(endDistance - startDistance)).toBeGreaterThan(4)
    expect(Math.abs(drone.phase - heading)).toBeLessThan(0.2)
  })

  it('holds helicopters in their altitude band so climbing is an escape', () => {
    const { state } = fillWave(MID_WAVE_AT)
    const highPlayer = { x: 10, y: 95, z: 20 }
    for (let tick = 0; tick < 240; tick += 1) stepEnemies(state, highPlayer, 1 / 60)
    for (const enemy of state.slots) {
      if (!enemy.active || enemy.kind !== 'helicopter') continue
      expect(Math.abs(enemy.position.y - airBandForSlot(enemy.kind, enemy.slot))).toBeLessThan(1.5)
    }
  })

  it('never lets a drone climb after the player', () => {
    // Drones no longer use altitude bands at all - each one keeps the height it
    // spawned at, so altitude is a place the player can escape to.
    const { state } = fillWave(MID_WAVE_AT)
    const heights = state.slots
      .filter((enemy) => enemy.active && enemy.kind === 'drone')
      .map((enemy) => ({ enemy, y: enemy.position.y }))
    for (let tick = 0; tick < 240; tick += 1) stepEnemies(state, { x: 10, y: 95, z: 20 }, 1 / 60)
    for (const { enemy, y } of heights) {
      if (!enemy.active) continue
      // Mines bob a little; nothing rises toward the player.
      expect(enemy.position.y).toBeLessThan(y + 2)
    }
  })

  it('lets helicopters actually open fire', () => {
    const state = createEnemyState()
    const player = { x: 0, y: 12, z: 0 }
    const helicopter = state.slots.find((enemy) => enemy.kind === 'helicopter')!
    helicopter.active = true
    helicopter.position = { x: 0, y: 22, z: 30 }
    helicopter.attackTimer = 0
    for (let tick = 0; tick < 90; tick += 1) stepEnemies(state, player, 1 / 60)
    expect(state.projectiles.some((projectile) => projectile.active)).toBe(true)
  })

  it('destroys a drone the player flies through and never lets contacts stack', () => {
    const state = createEnemyState()
    const player = { x: 0, y: 8, z: 0 }
    const drones = state.slots.filter((enemy) => enemy.kind === 'drone').slice(0, 3)
    for (const drone of drones) {
      drone.active = true
      drone.hitRadius = 0.75
      drone.position = { x: 0, y: 8, z: 0 }
    }
    const tank = state.slots.find((enemy) => enemy.kind === 'tank')!
    tank.active = true
    tank.hitRadius = 2.8
    tank.position = { x: 0, y: 8, z: 0 }
    const damage = resolveEnemyContacts(state, player)
    // Worst single contact, not the sum of four bodies.
    expect(damage).toBe(5)
    expect(state.contactKills).toBe(3)
    expect(drones.every((drone) => !drone.active)).toBe(true)
    expect(tank.active).toBe(true)
  })
})

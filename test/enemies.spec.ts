import { describe, expect, it } from 'vitest'
import {
  DRONE_MINE_HIT_RADIUS,
  ENEMY_CAPS,
  ENEMY_MAX_HP,
  ENEMY_WAVE_STAGES,
  activeEnemyCount,
  createEnemyState,
  helicopterBandForSlot,
  hitEnemy,
  resolveEnemyContacts,
  stepEnemies,
  syncEnemyTiers,
  waveStageForTime,
  type EnemyKind,
} from '../src/core/enemies'
import { isAbsorbable } from '../src/core/beam'

function fillWave(time: number) {
  const state = createEnemyState()
  const player = { x: 10, y: 14, z: 20 }
  for (let tick = 0; tick < 720; tick += 1) syncEnemyTiers(state, time, player, 0, 0.05)
  return { state, player }
}

// Wave times are data, not literals. They were respaced when the run went to
// five minutes, and every test that had pinned a number broke; naming them off
// the table means the next respacing carries the tests with it.
const MID_WAVE_AT = ENEMY_WAVE_STAGES[2]!.at
const FIGHTER_WAVE_AT = ENEMY_WAVE_STAGES[3]!.at
const LAST_WAVE_AT = ENEMY_WAVE_STAGES[ENEMY_WAVE_STAGES.length - 1]!.at

describe('time-based enemy waves', () => {
  it('leaves only the drone mine grabbable by tractor physics', () => {
    const state = createEnemyState()
    // The mine can be caught and dragged; a caught bomb is still a bomb, so
    // the swallow path may never bank it as food.
    const drone = state.slots.find((candidate) => candidate.kind === 'drone')!
    expect(drone.beamImmune).toBe(false)
    expect(isAbsorbable('drone', 1.6, Number.POSITIVE_INFINITY)).toBe(false)
    for (const kind of ['helicopter', 'fighter'] as const) {
      const enemy = state.slots.find((candidate) => candidate.kind === kind)!
      expect(enemy.beamImmune).toBe(true)
    }
    expect(ENEMY_WAVE_STAGES.at(-1)!.at).toBe(160)
  })

  it('detonates a beam-held mine that is drawn onto the hull', () => {
    const state = createEnemyState()
    const drone = state.slots.find((candidate) => candidate.kind === 'drone')!
    drone.active = true
    drone.hitRadius = DRONE_MINE_HIT_RADIUS
    drone.inBeam = true
    drone.position.x = 0
    drone.position.y = 10
    drone.position.z = 0
    drone.target.y = 10
    stepEnemies(state, { x: 0, y: 10.5, z: 0 }, 1 / 60, { x: 0, y: 0, z: 0 }, 1.4)
    expect(state.mineExplosion).not.toBeNull()
    expect(drone.active).toBe(false)
  })

  it('field-arms a beam-held mine the moment the pull drags it inside the radius', () => {
    const state = createEnemyState()
    const drone = state.slots.find((candidate) => candidate.kind === 'drone')!
    drone.active = true
    drone.hitRadius = DRONE_MINE_HIT_RADIUS
    drone.inBeam = true
    drone.position.x = 0
    drone.position.y = 10
    drone.position.z = 0
    drone.target.y = 10
    // Inside the blast field but off the hull: the ordinary arming applies
    // on the beam exactly as off it, and the fuse keeps running while held.
    const player = { x: 0, y: 10, z: 6 }
    stepEnemies(state, player, 1 / 60, { x: 0, y: 0, z: 0 }, 1.4)
    expect(drone.mineArmed).toBe(true)
    for (let tick = 0; tick < 60 && drone.active; tick += 1) stepEnemies(state, player, 1 / 60, { x: 0, y: 0, z: 0 }, 1.4)
    expect(drone.active).toBe(false)
  })
  it('starts with an empty sky, and fills it the moment the drone wave lands', () => {
    // The opening stage is the sighting: the city has noticed the craft and
    // has not answered yet. A drone in the air before the bulletin announcing
    // drones would make that bulletin a recap.
    const state = createEnemyState()
    const player = { x: 0, y: 4, z: 0 }
    for (let tick = 0; tick * (1 / 60) < ENEMY_WAVE_STAGES[1]!.at; tick += 1) {
      syncEnemyTiers(state, tick * (1 / 60), player, 0, 1 / 60)
      expect(activeEnemyCount(state)).toBe(0)
    }
    expect(state.slots.some((enemy) => ['police', 'police-car', 'soldier'].includes(enemy.kind as string))).toBe(false)
    expect(waveStageForTime(ENEMY_WAVE_STAGES[1]!.at)).toBe(1)
    // The wave boundary raises the bulletin and the spawner on the same tick,
    // so the first mines are up while the band is still sliding in.
    syncEnemyTiers(state, ENEMY_WAVE_STAGES[1]!.at, player, 0, 1 / 60)
    expect(activeEnemyCount(state, 'drone')).toBe(2)
  })

  it('escalates to a bounded mixed army and a single boss', () => {
    const { state } = fillWave(LAST_WAVE_AT)
    // The wave table is the floor rather than the whole population now: the
    // dreadnought launches escorts of its own on top of what the spawner
    // fills, and the caps are the ceiling that keeps that bounded.
    const targets = ENEMY_WAVE_STAGES[ENEMY_WAVE_STAGES.length - 1]!.targets as Partial<Record<EnemyKind, number>>
    for (const kind of ['drone', 'helicopter', 'fighter'] as const) {
      expect(activeEnemyCount(state, kind)).toBeGreaterThanOrEqual(targets[kind]!)
      expect(activeEnemyCount(state, kind)).toBeLessThanOrEqual(ENEMY_CAPS[kind])
    }
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

  it('flashes a survivor on every laser hit, fading in a fifth of a second', () => {
    const { state } = fillWave(LAST_WAVE_AT)
    const boss = state.slots.find((enemy) => enemy.kind === 'boss' && enemy.active)!
    expect(boss.hurt).toBe(0)
    hitEnemy(state, boss.id)
    expect(boss.hurt).toBe(1)
    const player = { x: 500, y: 6, z: 500 }
    for (let tick = 0; tick < 6; tick += 1) stepEnemies(state, player, 1 / 60)
    expect(boss.hurt).toBeGreaterThan(0)
    expect(boss.hurt).toBeLessThan(1)
    for (let tick = 0; tick < 20; tick += 1) stepEnemies(state, player, 1 / 60)
    expect(boss.hurt).toBe(0)
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

  it('holds helicopters in their altitude band while nothing has provoked them', () => {
    const { state } = fillWave(MID_WAVE_AT)
    const highPlayer = { x: 10, y: 95, z: 20 }
    for (let tick = 0; tick < 240; tick += 1) stepEnemies(state, highPlayer, 1 / 60)
    for (const enemy of state.slots) {
      if (!enemy.active || enemy.kind !== 'helicopter') continue
      expect(Math.abs(enemy.position.y - helicopterBandForSlot(enemy.slot))).toBeLessThan(1.5)
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

  it('destroys a drone the player flies through and never lets contacts stack', () => {
    const state = createEnemyState()
    const player = { x: 0, y: 8, z: 0 }
    const drones = state.slots.filter((enemy) => enemy.kind === 'drone').slice(0, 3)
    for (const drone of drones) {
      drone.active = true
      drone.hitRadius = 0.75
      drone.position = { x: 0, y: 8, z: 0 }
    }
    const helicopter = state.slots.find((enemy) => enemy.kind === 'helicopter')!
    helicopter.active = true
    helicopter.hitRadius = 2.4
    helicopter.position = { x: 0, y: 8, z: 0 }
    const damage = resolveEnemyContacts(state, player)
    // Worst single contact, not the sum of four bodies.
    expect(damage).toBe(5)
    expect(state.contactKills).toBe(3)
    expect(drones.every((drone) => !drone.active)).toBe(true)
    expect(helicopter.active).toBe(true)
  })
})

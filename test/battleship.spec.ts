import { describe, expect, it } from 'vitest'
import { isAbsorbable } from '../src/core/beam'
import {
  BATTLESHIP_ALTITUDE,
  BATTLESHIP_LENGTH,
  BATTLESHIP_MAIN_GUN_EVERY,
  BATTLESHIP_ORBIT,
  BATTLESHIP_TURRETS,
  ENEMY_MAX_HP,
  ENEMY_WAVE_STAGES,
  battleshipTurretPoint,
  createEnemyState,
  hitEnemy,
  stepEnemies,
  syncEnemyTiers,
  type EnemySlot,
} from '../src/core/enemies'

const LAST_WAVE_AT = ENEMY_WAVE_STAGES[ENEMY_WAVE_STAGES.length - 1]!.at

function launch(playerY = 30) {
  const state = createEnemyState(7)
  const player = { x: 0, y: playerY, z: 0 }
  for (let tick = 0; tick < 720; tick += 1) syncEnemyTiers(state, LAST_WAVE_AT, player, 0, 0.05)
  const ship = state.slots.find((enemy) => enemy.kind === 'boss' && enemy.active)!
  return { state, player, ship }
}

describe("earth's last resort", () => {
  it('sends exactly one ship, and only at the last wave', () => {
    const early = createEnemyState(3)
    for (let tick = 0; tick < 720; tick += 1) syncEnemyTiers(early, ENEMY_WAVE_STAGES[6]!.at, { x: 0, y: 20, z: 0 }, 0, 0.05)
    expect(early.slots.filter((enemy) => enemy.kind === 'boss' && enemy.active)).toHaveLength(0)
    const { state } = launch()
    expect(state.slots.filter((enemy) => enemy.kind === 'boss' && enemy.active)).toHaveLength(1)
  })

  it('is not food, at any craft size', () => {
    // "Too big to eat yet" would be wrong: the player reaches the size cap in a
    // good run, and the fight has to still be a fight when they do.
    const { ship } = launch()
    expect(ship.beamImmune).toBe(true)
    expect(isAbsorbable('boss', ship.diameter, Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('holds high station and circles instead of sitting on the player', () => {
    // The old boss hovered eight metres over the player's head, where a large
    // hull is invisible and behaves like a helicopter.
    const { state, player, ship } = launch()
    for (let tick = 0; tick < 60 * 60; tick += 1) stepEnemies(state, player, 1 / 60)
    expect(Math.abs(ship.position.y - BATTLESHIP_ALTITUDE)).toBeLessThan(3)
    const range = Math.hypot(ship.position.x - player.x, ship.position.z - player.z)
    expect(range).toBeGreaterThan(BATTLESHIP_ORBIT * 0.7)
    expect(range).toBeLessThan(BATTLESHIP_ORBIT * 1.35)
  })

  it('points its bow along its own course', () => {
    const { state, player, ship } = launch()
    for (let tick = 0; tick < 40 * 60; tick += 1) stepEnemies(state, player, 1 / 60)
    const beforeX = ship.position.x
    const beforeZ = ship.position.z
    for (let tick = 0; tick < 30; tick += 1) stepEnemies(state, player, 1 / 60)
    const course = Math.atan2(ship.position.x - beforeX, ship.position.z - beforeZ)
    const delta = Math.abs(Math.atan2(Math.sin(course - ship.rotation.y), Math.cos(course - ship.rotation.y)))
    expect(delta).toBeLessThan(0.35)
  })

  it('walks a broadside down the hull instead of firing one big shot', () => {
    const { state, player, ship } = launch()
    const origins: { at: number; x: number; z: number }[] = []
    let previousTelegraph = ship.telegraph
    for (let tick = 0; tick < 30 * 60; tick += 1) {
      stepEnemies(state, player, 1 / 60)
      // A fresh aim: the telegraph jumped back up.
      if (ship.telegraph > previousTelegraph) origins.push({ at: tick / 60, x: ship.muzzle.x, z: ship.muzzle.z })
      previousTelegraph = ship.telegraph
    }
    expect(origins.length).toBeGreaterThan(BATTLESHIP_TURRETS.length)
    // Successive shots inside a broadside leave from different guns, and the
    // guns are metres apart along the hull.
    let moved = 0
    for (let index = 1; index < origins.length; index += 1) {
      const gap = Math.hypot(origins[index]!.x - origins[index - 1]!.x, origins[index]!.z - origins[index - 1]!.z)
      if (gap > 4) moved += 1
    }
    expect(moved).toBeGreaterThan(origins.length / 2)
    // And they are staggered, not simultaneous.
    const spacing = origins.slice(1).map((shot, index) => shot.at - origins[index]!.at)
    expect(Math.min(...spacing)).toBeGreaterThan(0.05)
  })

  it('reloads between broadsides, which is when the laser gets used', () => {
    const { state, player, ship } = launch()
    const gaps: number[] = []
    let last = 0
    let previousTelegraph = ship.telegraph
    for (let tick = 0; tick < 40 * 60; tick += 1) {
      stepEnemies(state, player, 1 / 60)
      if (ship.telegraph > previousTelegraph) { gaps.push(tick / 60 - last); last = tick / 60 }
      previousTelegraph = ship.telegraph
    }
    // At least one long pause per handful of shots: the fight has a rhythm
    // rather than being a continuous wall.
    expect(Math.max(...gaps.slice(1))).toBeGreaterThan(3)
  })

  it('fires the bow gun with a much longer warning than the turrets', () => {
    const { state, player, ship } = launch()
    const telegraphs: number[] = []
    let previousTelegraph = ship.telegraph
    for (let tick = 0; tick < 60 * 60; tick += 1) {
      stepEnemies(state, player, 1 / 60)
      if (ship.telegraph > previousTelegraph) telegraphs.push(ship.telegraphLength)
      previousTelegraph = ship.telegraph
    }
    const longest = Math.max(...telegraphs)
    const shortest = Math.min(...telegraphs)
    expect(longest).toBeGreaterThan(shortest * 3)
    // Roughly one main-gun shot per BATTLESHIP_MAIN_GUN_EVERY volleys.
    const heavy = telegraphs.filter((value) => value === longest).length
    expect(heavy).toBeGreaterThan(0)
    expect(heavy).toBeLessThan(telegraphs.length / BATTLESHIP_MAIN_GUN_EVERY)
  })

  it('spreads its turrets across the length of the hull', () => {
    const { ship } = launch()
    ship.position.x = 0
    ship.position.z = 0
    ship.rotation.y = 0
    const point = { x: 0, y: 0, z: 0 }
    const spots = BATTLESHIP_TURRETS.map((_, index) => ({ ...battleshipTurretPoint(ship, index, point) }))
    const span = Math.max(...spots.map((spot) => spot.z)) - Math.min(...spots.map((spot) => spot.z))
    expect(span).toBeGreaterThan(BATTLESHIP_LENGTH * 0.6)
  })

  it('takes a real laser investment to bring down', () => {
    // The whole reason this exists is to give laser-power a target. An
    // unupgraded laser must be able to finish it inside the last fifty
    // seconds; a maxed one must finish it visibly sooner.
    const shotsAt = (damage: number) => {
      const state = createEnemyState(11)
      const player = { x: 0, y: 30, z: 0 }
      for (let tick = 0; tick < 720; tick += 1) syncEnemyTiers(state, LAST_WAVE_AT, player, 0, 0.05)
      const ship = state.slots.find((enemy: EnemySlot) => enemy.kind === 'boss' && enemy.active)!
      let shots = 0
      while (!hitEnemy(state, ship.id, damage).destroyed) {
        shots += 1
        if (shots > 500) break
      }
      return shots + 1
    }
    const plain = shotsAt(1)
    const maxed = shotsAt(1 + 4 * 0.45)
    expect(plain).toBe(ENEMY_MAX_HP.boss)
    expect(maxed).toBeLessThan(plain / 2)
  })
})

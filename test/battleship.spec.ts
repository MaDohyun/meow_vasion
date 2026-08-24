import { describe, expect, it } from 'vitest'
import { isAbsorbable } from '../src/core/beam'
import { DRONE_DEFAULTS } from '../src/core/drone'
import {
  BATTLESHIP_ALTITUDE,
  BATTLESHIP_LENGTH,
  BATTLESHIP_MAIN_GUN_TELEGRAPH,
  BATTLESHIP_ORBIT,
  BATTLESHIP_ORB_RING_COUNT,
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
    for (let tick = 0; tick < 720; tick += 1) syncEnemyTiers(early, ENEMY_WAVE_STAGES.at(-2)!.at, { x: 0, y: 20, z: 0 }, 0, 0.05)
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

  it('scatters slow orb rings in every direction instead of aimed broadsides', () => {
    const { state, player, ship } = launch()
    // Only the ship: the wave's fighters carry curtains of their own, and this
    // is about whose orbs ring the hull.
    for (const enemy of state.slots) if (enemy !== ship) enemy.active = false
    let orbs: typeof state.projectiles = []
    for (let tick = 0; tick < 30 * 60; tick += 1) {
      stepEnemies(state, player, 1 / 60)
      orbs = state.projectiles.filter((projectile) => projectile.active && projectile.kind === 'orb')
      if (orbs.length >= BATTLESHIP_ORB_RING_COUNT) break
    }
    expect(orbs.length).toBeGreaterThanOrEqual(BATTLESHIP_ORB_RING_COUNT)
    // Every direction at once: the bearings cover the whole compass.
    const sectors = new Set(orbs.map((orb) => {
      const bearing = (Math.atan2(orb.velocity.x, orb.velocity.z) + Math.PI * 2) % (Math.PI * 2)
      return Math.floor(bearing / (Math.PI / 4))
    }))
    expect(sectors.size).toBe(8)
    // Slow: the halo is flown through, not fled.
    for (const orb of orbs) {
      expect(Math.hypot(orb.velocity.x, orb.velocity.z)).toBeLessThan(DRONE_DEFAULTS.maxSpeed)
    }
  })

  it('reloads between flurries, which is when the laser gets used', () => {
    const { state, player, ship } = launch()
    for (const enemy of state.slots) if (enemy !== ship) enemy.active = false
    // Times when fresh orbs joined the sky. Rings inside one flurry are close
    // together; the reload shows up as a long silence between clusters.
    const bursts: number[] = []
    let previous = 0
    for (let tick = 0; tick < 40 * 60; tick += 1) {
      stepEnemies(state, player, 1 / 60)
      const count = state.projectiles.filter((projectile) => projectile.active && projectile.kind === 'orb').length
      if (count > previous) bursts.push(tick / 60)
      previous = count
    }
    expect(bursts.length).toBeGreaterThan(2)
    const gaps = bursts.slice(1).map((at, index) => at - bursts[index]!)
    // At least one long pause per handful of rings: the fight has a rhythm
    // rather than being a continuous wall.
    expect(Math.max(...gaps)).toBeGreaterThan(3)
  })

  it('keeps the bow gun as the only aimed, telegraphed shot', () => {
    const { state, player, ship } = launch()
    for (const enemy of state.slots) if (enemy !== ship) enemy.active = false
    const telegraphs: number[] = []
    let previousTelegraph = ship.telegraph
    for (let tick = 0; tick < 60 * 60; tick += 1) {
      stepEnemies(state, player, 1 / 60)
      if (ship.telegraph > previousTelegraph) telegraphs.push(ship.telegraphLength)
      previousTelegraph = ship.telegraph
    }
    // The rings fire without warning - they are their own warning - so every
    // telegraph that appears is the bow gun's long one.
    expect(telegraphs.length).toBeGreaterThan(1)
    for (const length of telegraphs) expect(length).toBeCloseTo(BATTLESHIP_MAIN_GUN_TELEGRAPH, 5)
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

import { describe, expect, it } from 'vitest'
import { DRONE_DEFAULTS } from '../src/core/drone'
import {
  ENEMY_CONTACT_DAMAGE,
  HELICOPTER_CHASE_SPEED,
  HELICOPTER_DETECT_RANGE,
  HELICOPTER_GIVE_UP_RANGE,
  HELICOPTER_PEEL_RANGE,
  HELICOPTER_ROAM_RADIUS,
  HELICOPTER_ROAM_SPEED,
  createEnemyState,
  helicopterBandForSlot,
  resolveEnemyContacts,
  stepEnemies,
  type EnemyMode,
} from '../src/core/enemies'

/** A helicopter placed by hand, the way kamikaze.spec places mines. */
function patrol(position: { x: number; y: number; z: number }) {
  const state = createEnemyState(0xbead)
  const enemy = state.slots.find((slot) => slot.kind === 'helicopter')!
  enemy.active = true
  enemy.mode = 'roam'
  enemy.hitRadius = 2.4
  enemy.position = { ...position }
  enemy.anchor = { ...position }
  return { state, enemy }
}

const craftRadius = 1.4
const contactRange = 2.4 + craftRadius

describe('helicopter ambush behaviour', () => {
  it('keeps the speed ladder honest: cruise cannot outrun it, turbo can', () => {
    // The whole escape design in three inequalities. The chase has to be
    // faster than cruising or fleeing in a straight line would be free, and
    // slower than turbo or there would be no escape at all.
    expect(HELICOPTER_CHASE_SPEED).toBeGreaterThan(DRONE_DEFAULTS.maxSpeed)
    expect(HELICOPTER_CHASE_SPEED).toBeLessThan(DRONE_DEFAULTS.boostSpeed)
    // And the patrol reads as loitering, not as an approach.
    expect(HELICOPTER_ROAM_SPEED).toBeLessThan(DRONE_DEFAULTS.maxSpeed / 2)
    // Peeling off and giving up both drop the player outside the lock-on
    // range, so neither hands the helicopter an instant second chase.
    expect(HELICOPTER_PEEL_RANGE).toBeGreaterThan(HELICOPTER_DETECT_RANGE)
    expect(HELICOPTER_GIVE_UP_RANGE).toBeGreaterThan(HELICOPTER_DETECT_RANGE)
  })

  it('idles slowly around its spawn point while the player keeps their distance', () => {
    const home = { x: 0, y: helicopterBandForSlot(0), z: 0 }
    const { state, enemy } = patrol(home)
    const player = { x: 150, y: 12, z: 0 }
    let longestStep = 0
    let previousX = enemy.position.x
    let previousZ = enemy.position.z
    for (let tick = 0; tick < 30 * 60; tick += 1) {
      stepEnemies(state, player, 1 / 60)
      longestStep = Math.max(longestStep, Math.hypot(enemy.position.x - previousX, enemy.position.z - previousZ))
      previousX = enemy.position.x
      previousZ = enemy.position.z
      // Never further from home than the patrol radius plus the room one turn
      // takes, at any point along the way - not just where the loop ended.
      expect(Math.hypot(enemy.position.x - home.x, enemy.position.z - home.z)).toBeLessThan(HELICOPTER_ROAM_RADIUS + 10)
    }
    expect(enemy.active).toBe(true)
    expect(enemy.mode).toBe('roam')
    // Slow: patrol speed, never chase speed.
    expect(longestStep * 60).toBeLessThan(HELICOPTER_ROAM_SPEED + 2)
    // And it holds its shelf.
    expect(Math.abs(enemy.position.y - helicopterBandForSlot(enemy.slot))).toBeLessThan(1.5)
  })

  it('locks on when the player crosses the detection range and runs them down', () => {
    const { state, enemy } = patrol({ x: 0, y: 20, z: 0 })
    const player = { x: 0, y: 20, z: HELICOPTER_DETECT_RANGE - 2 }
    stepEnemies(state, player, 1 / 60)
    expect(enemy.mode).toBe('chase')
    // The lock-on borrows the aiming tint, so the player is shown the charge.
    expect(enemy.aiming).toBe(true)
    let ticks = 0
    while (ticks < 60 * 4) {
      stepEnemies(state, player, 1 / 60)
      ticks += 1
      const distance = Math.hypot(enemy.position.x - player.x, enemy.position.y - player.y, enemy.position.z - player.z)
      if (distance <= contactRange) break
    }
    // Fifty metres at chase speed is under two seconds of flight.
    expect(ticks).toBeLessThan(60 * 2)
  })

  it('follows the player out of the altitude band while chasing', () => {
    // A ram that respected the band could never land on anyone above it.
    const { state, enemy } = patrol({ x: 0, y: 20, z: 0 })
    const player = { x: 0, y: 60, z: 30 }
    for (let tick = 0; tick < 60 * 3; tick += 1) stepEnemies(state, player, 1 / 60)
    expect(enemy.mode).toBe('chase')
    expect(enemy.position.y).toBeGreaterThan(50)
  })

  it('catches a craft that flees at cruise', () => {
    const { state, enemy } = patrol({ x: 0, y: 12, z: 0 })
    const player = { x: 0, y: 12, z: 20 }
    let caught = false
    for (let tick = 0; tick < 60 * 6 && !caught; tick += 1) {
      player.z += DRONE_DEFAULTS.maxSpeed / 60
      stepEnemies(state, player, 1 / 60)
      caught = Math.hypot(enemy.position.x - player.x, enemy.position.y - player.y, enemy.position.z - player.z) <= contactRange
    }
    expect(caught).toBe(true)
  })

  it('loses a craft that flees on turbo, and settles where the chase died', () => {
    const { state, enemy } = patrol({ x: 0, y: 12, z: 0 })
    const player = { x: 0, y: 12, z: 10 }
    stepEnemies(state, player, 1 / 60)
    expect(enemy.mode).toBe('chase')
    let escaped = false
    for (let tick = 0; tick < 60 * 10 && !escaped; tick += 1) {
      player.z += DRONE_DEFAULTS.boostSpeed / 60
      stepEnemies(state, player, 1 / 60)
      escaped = enemy.mode === 'roam'
    }
    expect(escaped).toBe(true)
    // It owns the sky where it lost you, rather than commuting home.
    expect(Math.hypot(enemy.anchor.x - enemy.position.x, enemy.anchor.z - enemy.position.z)).toBeLessThan(1)
    const gap = Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z)
    expect(gap).toBeGreaterThan(HELICOPTER_GIVE_UP_RANGE - 1)
  })

  it('charges one contact hit for a ram and peels off instead of grinding', () => {
    const { state, enemy } = patrol({ x: 0, y: 12, z: 0 })
    enemy.mode = 'chase' as EnemyMode
    const player = { x: 0, y: 12, z: 0 }
    const damage = resolveEnemyContacts(state, player, craftRadius)
    expect(damage).toBe(ENEMY_CONTACT_DAMAGE.helicopter)
    expect(state.helicopterRams).toBe(1)
    // The helicopter survives its own attack - it is a ram, not a kamikaze.
    expect(enemy.active).toBe(true)
    expect(enemy.mode).toBe('outbound')
    // And it carries itself back out past the lock-on range before patrolling.
    for (let tick = 0; tick < 60 * 4 && enemy.mode === 'outbound'; tick += 1) stepEnemies(state, player, 1 / 60)
    expect(enemy.mode).toBe('roam')
    const gap = Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z)
    expect(gap).toBeGreaterThanOrEqual(HELICOPTER_PEEL_RANGE - 1)
  })

  it('never fires a shot, even from its old firing envelope', () => {
    // The ram is the whole attack. This is the exact position and altitude the
    // rifle used to open up from.
    const { state, enemy } = patrol({ x: 0, y: 22, z: 30 })
    enemy.attackTimer = 0
    const player = { x: 0, y: 12, z: 0 }
    for (let tick = 0; tick < 60 * 5; tick += 1) stepEnemies(state, player, 1 / 60)
    expect(state.projectiles.some((projectile) => projectile.active)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  DRONE_MINE_SHARE,
  ENEMY_CONTACT_DAMAGE,
  createEnemyState,
  isDroneMine,
  resolveEnemyContacts,
  stepEnemies,
  syncEnemyTiers,
} from '../src/core/enemies'

function droneWave() {
  const state = createEnemyState(0x51de)
  const player = { x: 0, y: 12, z: 0 }
  for (let tick = 0; tick < 400; tick += 1) syncEnemyTiers(state, 60, player, 0, 0.05)
  return { state, player, drones: state.slots.filter((enemy) => enemy.kind === 'drone' && enemy.active) }
}

describe('suicide drones', () => {
  it('splits into hovering mines and one-way passers', () => {
    const { drones } = droneWave()
    const mines = drones.filter(isDroneMine)
    expect(drones.length).toBeGreaterThan(8)
    expect(mines.length).toBeGreaterThan(0)
    expect(mines.length).toBeLessThan(drones.length)
    // Roughly the configured share, with room for a small sample.
    expect(mines.length / drones.length).toBeGreaterThan(DRONE_MINE_SHARE - 0.3)
    expect(mines.length / drones.length).toBeLessThan(DRONE_MINE_SHARE + 0.3)
  })

  it('holds a mine on its spot no matter where the player goes', () => {
    const { state } = droneWave()
    const mine = state.slots.find((enemy) => enemy.active && isDroneMine(enemy))!
    const startX = mine.position.x
    const startZ = mine.position.z
    // Fly the player right past it; a mine must not follow.
    for (let tick = 0; tick < 300; tick += 1) {
      stepEnemies(state, { x: tick * 0.4, y: 12, z: tick * 0.2 }, 1 / 60)
    }
    expect(Math.abs(mine.position.x - startX)).toBeLessThan(0.001)
    expect(Math.abs(mine.position.z - startZ)).toBeLessThan(0.001)
  })

  it('flies a passer dead straight, so its line can be read and dodged', () => {
    const { state, player } = droneWave()
    const drone = state.slots.find((enemy) => enemy.active && enemy.kind === 'drone' && !isDroneMine(enemy))!
    const heading = drone.phase
    const startY = drone.position.y
    const from = { x: drone.position.x, z: drone.position.z }
    for (let tick = 0; tick < 90; tick += 1) stepEnemies(state, player, 1 / 60)
    // Heading fixed at spawn and never revised - no homing, no altitude chase.
    expect(drone.phase).toBe(heading)
    expect(drone.position.y).toBe(startY)
    const travelled = Math.atan2(drone.position.x - from.x, drone.position.z - from.z)
    expect(Math.abs(Math.atan2(Math.sin(travelled - heading), Math.cos(travelled - heading)))).toBeLessThan(0.01)
  })

  it('does not chase the player upward', () => {
    const { state } = droneWave()
    const drone = state.slots.find((enemy) => enemy.active && enemy.kind === 'drone' && !isDroneMine(enemy))!
    const startY = drone.position.y
    for (let tick = 0; tick < 240; tick += 1) stepEnemies(state, { x: 0, y: 110, z: 0 }, 1 / 60)
    expect(drone.position.y).toBe(startY)
  })

  it('detonates on contact and reports where, and hits harder than a vehicle', () => {
    expect(ENEMY_CONTACT_DAMAGE.drone).toBeGreaterThan(ENEMY_CONTACT_DAMAGE['police-car'])
    const state = createEnemyState()
    const drone = state.slots.find((enemy) => enemy.kind === 'drone')!
    drone.active = true
    drone.hitRadius = 0.75
    drone.position = { x: 4, y: 9, z: -2 }
    const damage = resolveEnemyContacts(state, { x: 4, y: 9, z: -2 })
    expect(damage).toBe(ENEMY_CONTACT_DAMAGE.drone)
    expect(drone.active).toBe(false)
    expect(state.contactKills).toBe(1)
    expect(state.lastContactPoint).toEqual({ x: 4, y: 9, z: -2 })
  })

  it('never shoots', () => {
    const { state, player } = droneWave()
    for (const enemy of state.slots) if (enemy.kind !== 'drone') enemy.active = false
    for (let tick = 0; tick < 600; tick += 1) stepEnemies(state, player, 1 / 60)
    expect(state.projectiles.some((projectile) => projectile.active)).toBe(false)
  })
})

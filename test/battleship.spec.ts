import { describe, expect, it } from 'vitest'
import { isAbsorbable } from '../src/core/beam'
import { DRONE_DEFAULTS } from '../src/core/drone'
import { maxAltitude } from '../src/core/size'
import {
  BATTLESHIP_ALTITUDE,
  BATTLESHIP_ESCORT_FIGHTERS,
  BATTLESHIP_ESCORT_HELICOPTERS,
  BATTLESHIP_ESCORT_INTERVAL,
  BATTLESHIP_ESCORT_MINES,
  BATTLESHIP_ESCORT_RADIUS,
  BATTLESHIP_LENGTH,
  BATTLESHIP_ORBIT,
  BATTLESHIP_ORB_PITCHES,
  BATTLESHIP_ORB_RING_COUNT,
  BATTLESHIP_PURSUIT_RANGE,
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

  it('has the halo as its whole armoury: nothing it fires is aimed', () => {
    // The ship used to carry a telegraphed bow gun and a lock-and-stream flak
    // battery as well, and between them and the rooftop network the late game
    // asked the player to read three separate warnings while threading a
    // curtain. The curtain is the half that reads at a glance, so it is the
    // half that stayed.
    const { state, player, ship } = launch()
    for (const enemy of state.slots) if (enemy !== ship) enemy.active = false
    // Gathered rather than asserted per tick: a minute of ticks times a pool
    // of shots is a quarter of a million assertions and a test that times out.
    const kinds = new Set<string>()
    let telegraphed = false
    for (let tick = 0; tick < 60 * 60; tick += 1) {
      stepEnemies(state, player, 1 / 60)
      if (ship.telegraph > 0 || ship.aiming) telegraphed = true
      for (const projectile of state.projectiles) if (projectile.active) kinds.add(projectile.kind)
    }
    // Nothing is ever shown before it leaves, because nothing needs to be: an
    // orb slow enough to be flown through is its own warning.
    expect(telegraphed).toBe(false)
    expect([...kinds]).toEqual(['orb'])
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

  it('scatters the halo above and below itself as well as around', () => {
    // A flat ring is a disc in the air, and a disc is dodged by doing the one
    // thing this game makes easiest: changing altitude.
    const { state, player, ship } = launch()
    for (const enemy of state.slots) if (enemy !== ship) enemy.active = false
    let orbs: typeof state.projectiles = []
    for (let tick = 0; tick < 30 * 60; tick += 1) {
      stepEnemies(state, player, 1 / 60)
      orbs = state.projectiles.filter((projectile) => projectile.active && projectile.kind === 'orb')
      if (orbs.length >= BATTLESHIP_ORB_RING_COUNT) break
    }
    expect(orbs.length).toBe(BATTLESHIP_ORB_RING_COUNT * BATTLESHIP_ORB_PITCHES.length)
    // Pitch relative to the ring's own flight, so this is the layering rather
    // than the shared drift toward the player's altitude.
    const pitches = orbs.map((orb) => Math.atan2(orb.velocity.y, Math.hypot(orb.velocity.x, orb.velocity.z)))
    const middle = (Math.max(...pitches) + Math.min(...pitches)) / 2
    expect(pitches.some((pitch) => pitch > middle + 0.1)).toBe(true)
    expect(pitches.some((pitch) => pitch < middle - 0.1)).toBe(true)
    // Still under cruise in every layer: the halo is flown through, not fled.
    for (const orb of orbs) expect(Math.hypot(orb.velocity.x, orb.velocity.z)).toBeLessThan(DRONE_DEFAULTS.maxSpeed)
  })

  it('runs down a player who just keeps flying away', () => {
    // Station-keeping is a following distance, so holding one heading used to
    // leave the boss behind the horizon and end the last wave without a fight.
    const { state, player, ship } = launch()
    for (const enemy of state.slots) if (enemy !== ship) enemy.active = false
    const velocity = { x: DRONE_DEFAULTS.boostSpeed, y: 0, z: 0 }
    let worst = 0
    for (let tick = 0; tick < 60 * 90; tick += 1) {
      player.x += velocity.x / 60
      stepEnemies(state, player, 1 / 60, velocity)
      worst = Math.max(worst, Math.hypot(ship.position.x - player.x, ship.position.z - player.z))
    }
    // A minute and a half of turbo in one direction, and it is still on top of
    // the player rather than a dot behind them.
    expect(worst).toBeLessThan(BATTLESHIP_PURSUIT_RANGE * 1.1)
    expect(Math.hypot(ship.position.x - player.x, ship.position.z - player.z)).toBeLessThan(BATTLESHIP_PURSUIT_RANGE)
  })

  it('launches mines, a helicopter and a fighter every ten seconds', () => {
    const { state, player, ship } = launch()
    for (const enemy of state.slots) {
      if (enemy === ship) continue
      enemy.active = false
      enemy.respawn = 0
    }
    // Parked well away from the craft: the ordinary spawner works around the
    // player, so anything that turns up beside the hull came off its deck.
    ship.position.x = 900
    ship.position.z = 0
    ship.position.y = BATTLESHIP_ALTITUDE
    state.escortTimer = BATTLESHIP_ESCORT_INTERVAL
    const alongside = () => state.slots.filter((enemy) => enemy.active && enemy.kind !== 'boss'
      && Math.hypot(enemy.position.x - ship.position.x, enemy.position.z - ship.position.z) < BATTLESHIP_ESCORT_RADIUS * 2)
    const fly = (seconds: number) => {
      for (let tick = 0; tick < 60 * seconds; tick += 1) syncEnemyTiers(state, LAST_WAVE_AT, player, 0, 1 / 60)
    }
    fly(BATTLESHIP_ESCORT_INTERVAL - 1)
    expect(alongside()).toHaveLength(0)
    fly(2)
    const launched = alongside()
    expect(launched.filter((enemy) => enemy.kind === 'drone')).toHaveLength(BATTLESHIP_ESCORT_MINES)
    expect(launched.filter((enemy) => enemy.kind === 'helicopter')).toHaveLength(BATTLESHIP_ESCORT_HELICOPTERS)
    expect(launched.filter((enemy) => enemy.kind === 'fighter')).toHaveLength(BATTLESHIP_ESCORT_FIGHTERS)
    // Everything leaves the deck under the keel rather than above it.
    for (const escort of launched) expect(escort.position.y).toBeLessThan(BATTLESHIP_ALTITUDE)
    // And the fighter is pointed at the player as it goes.
    const fighter = launched.find((enemy) => enemy.kind === 'fighter')!
    const toPlayer = Math.atan2(player.x - fighter.position.x, player.z - fighter.position.z)
    const run = Math.atan2(fighter.velocity.x, fighter.velocity.z)
    expect(Math.abs(Math.atan2(Math.sin(run - toPlayer), Math.cos(run - toPlayer)))).toBeLessThan(0.02)
    // One launch per interval, not one per tick.
    fly(1)
    expect(alongside()).toHaveLength(launched.length)
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

  it('is in reach of the craft the developer drill hands over, at once', () => {
    // Mirrors DRILL_CRAFT_SIZE in GameContext, kept as a literal here rather
    // than importing a React module into a core test - the same thing
    // daylight.spec does with the run length. What the drill promises is a
    // craft that can fly up to the ship; the opening saucer's ceiling is
    // thirty metres and the ship holds station at ninety-six, so a drill on a
    // starting craft would be a screenshot of the fight, not the fight.
    const drillCraftSize = 5.2
    expect(maxAltitude(drillCraftSize)).toBeGreaterThan(BATTLESHIP_ALTITUDE)
    // And the ship is up as soon as the drill's clock is, rather than a wave
    // interval later: the spawner puts the boss first whenever one is owed.
    const state = createEnemyState(19)
    const player = { x: 0, y: 60, z: 0 }
    syncEnemyTiers(state, LAST_WAVE_AT, player, 0, 1 / 60)
    expect(state.slots.filter((enemy) => enemy.kind === 'boss' && enemy.active)).toHaveLength(1)
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

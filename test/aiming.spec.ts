import { describe, expect, it } from 'vitest'
import {
  ENEMY_WAVE_STAGES,
  LEAD_ACCURACY,
  PROJECTILE_SPEED,
  createEnemyState,
  interceptTime,
  stepEnemies,
  stepEnemyProjectiles,
  syncEnemyTiers,
  type EnemyKind,
} from '../src/core/enemies'
import { DRONE_DEFAULTS } from '../src/core/drone'

/** Each enemy only shoots in its own altitude band. */
const BAND: Partial<Record<EnemyKind, number>> = {
  soldier: 3, police: 3, 'police-car': 3, helicopter: 12, tank: 12, fighter: 12, 'anti-air': 40,
}

/**
 * Fly a course past a wave and count the hits.
 *
 * `turn` is applied every tick once the run is under way, which is what
 * separates holding a heading from breaking one.
 */
function run(options: {
  kind: EnemyKind
  speed: number
  hitRadius?: number
  seconds?: number
  jink?: boolean
}) {
  const { kind, speed, hitRadius = 1.05, seconds = 40, jink = false } = options
  const state = createEnemyState(0xa11)
  const altitude = BAND[kind] ?? 12
  const player = { x: 0, y: altitude, z: 0 }
  const velocity = { x: 0, y: 0, z: speed }
  const at = ENEMY_WAVE_STAGES[5]!.at
  // Long enough for the wave to actually fill. The spawner hands out a few
  // slots a second across every kind, so a short warm-up measures a half-built
  // wave and moves whenever any kind's budget changes.
  for (let tick = 0; tick < 1600; tick += 1) syncEnemyTiers(state, at, player, 0, 0.05)
  for (const enemy of state.slots) if (enemy.active && enemy.kind !== kind) enemy.active = false
  let hits = 0
  const d = 1 / 60
  for (let tick = 0; tick < seconds * 60; tick += 1) {
    if (jink) {
      // Break course several times a second: faster than any telegraph, so no
      // prediction made at aim time survives to the shot.
      const swing = Math.sin(tick * d * 7)
      velocity.x = speed * swing
      velocity.z = speed * Math.cos(tick * d * 7)
    }
    player.x += velocity.x * d
    player.z += velocity.z * d
    stepEnemies(state, player, d, velocity)
    syncEnemyTiers(state, at, player, 0, d)
    if (stepEnemyProjectiles(state, player, d, hitRadius) > 0) hits += 1
  }
  return hits
}

/** The same course flown against a whole wave rather than one enemy type. */
function mixedWave(options: { speed: number; hitRadius?: number; jink?: boolean; altitude?: number }) {
  const { speed, hitRadius = 1.05, jink = false, altitude = 12 } = options
  const state = createEnemyState(0xa11)
  const player = { x: 0, y: altitude, z: 0 }
  const velocity = { x: 0, y: 0, z: speed }
  const at = ENEMY_WAVE_STAGES[5]!.at
  // Long enough for the wave to actually fill. The spawner hands out a few
  // slots a second across every kind, so a short warm-up measures a half-built
  // wave and moves whenever any kind's budget changes.
  for (let tick = 0; tick < 1600; tick += 1) syncEnemyTiers(state, at, player, 0, 0.05)
  let hits = 0
  const d = 1 / 60
  for (let tick = 0; tick < 60 * 60; tick += 1) {
    if (jink) {
      velocity.x = speed * Math.sin(tick * d * 7)
      velocity.z = speed * Math.cos(tick * d * 7)
    }
    player.x += velocity.x * d
    player.z += velocity.z * d
    stepEnemies(state, player, d, velocity)
    syncEnemyTiers(state, at, player, 0, d)
    if (stepEnemyProjectiles(state, player, d, hitRadius) > 0) hits += 1
  }
  return hits
}

describe('lead aiming', () => {
  it('fires faster than the craft can cruise', () => {
    // Without this there is no interception solution at all: a fleeing target
    // outruns the bullet and every shot misses no matter how well aimed. The
    // shots used to be slower than the craft, which is why the real rule of
    // the game was "stand still and die, move and be immortal".
    for (const [kind, speed] of Object.entries(PROJECTILE_SPEED)) {
      expect(speed, kind).toBeGreaterThan(DRONE_DEFAULTS.maxSpeed)
    }
  })

  it('hits a craft that holds its heading', () => {
    // The point of the whole change. Flying in a straight line at full speed
    // used to be perfect safety.
    expect(run({ kind: 'soldier', speed: DRONE_DEFAULTS.maxSpeed })).toBeGreaterThan(0)
    expect(run({ kind: 'tank', speed: DRONE_DEFAULTS.maxSpeed })).toBeGreaterThan(0)
  })

  it('misses a craft that breaks its heading', () => {
    // And the other half: the telegraph is a real window, not decoration.
    const straight = run({ kind: 'soldier', speed: DRONE_DEFAULTS.maxSpeed })
    const jinking = run({ kind: 'soldier', speed: DRONE_DEFAULTS.maxSpeed, jink: true })
    expect(jinking).toBeLessThan(straight)
  })

  it('hits a big craft far more often than a small one', () => {
    // Size is the cost of growing, and it only became a real cost once shots
    // could arrive at all. Judged purely on geometry: same aim, bigger target.
    const small = run({ kind: 'soldier', speed: DRONE_DEFAULTS.maxSpeed, hitRadius: 1.05 })
    const large = run({ kind: 'soldier', speed: DRONE_DEFAULTS.maxSpeed, hitRadius: 3.26 })
    expect(large).toBeGreaterThan(small)
  })

  it('makes holding a heading dangerous and breaking one safe', () => {
    // The whole design, measured against a full wave rather than one enemy
    // type. Before leading, a straight run at cruise took zero hits at every
    // altitude - the real rule was "stand still and die, move and be
    // immortal". Wide bounds: this guards the ordering, not the tuning.
    const straight = mixedWave({ speed: DRONE_DEFAULTS.maxSpeed })
    const jinking = mixedWave({ speed: DRONE_DEFAULTS.maxSpeed, jink: true })
    const hovering = mixedWave({ speed: 0 })
    expect(straight).toBeGreaterThan(3)
    expect(jinking).toBeLessThan(straight / 3)
    expect(hovering).toBeGreaterThan(straight)
  })

  it('charges a grown craft heavily for holding a heading', () => {
    // Size is the price of growing, and weaving is how it is paid. A big craft
    // that flies straight should be in real trouble; a big craft that weaves
    // should still be alive.
    const bigStraight = mixedWave({ speed: DRONE_DEFAULTS.maxSpeed, hitRadius: 3.26 })
    const smallStraight = mixedWave({ speed: DRONE_DEFAULTS.maxSpeed, hitRadius: 1.05 })
    const bigJinking = mixedWave({ speed: DRONE_DEFAULTS.maxSpeed, hitRadius: 3.26, jink: true })
    expect(bigStraight).toBeGreaterThan(smallStraight * 2)
    expect(bigJinking).toBeLessThan(bigStraight / 3)
  })

  it('leads worse the lower the enemy tier', () => {
    // The wave ladder is the difficulty curve: the first minute teaches the
    // rule, the anti-air network enforces it.
    expect(LEAD_ACCURACY.soldier).toBeLessThan(LEAD_ACCURACY.tank)
    expect(LEAD_ACCURACY.tank).toBeLessThan(LEAD_ACCURACY['anti-air'])
    expect(LEAD_ACCURACY['anti-air']).toBe(1)
    expect(LEAD_ACCURACY.drone).toBe(0)
  })

  it('never homes: a shot keeps the velocity it left with', () => {
    // A homing shot is endured, not dodged. Everything the player decides has
    // to happen before the trigger.
    const state = createEnemyState(0x5eed)
    const player = { x: 0, y: 3, z: 0 }
    const velocity = { x: 0, y: 0, z: 20 }
    const at = ENEMY_WAVE_STAGES[5]!.at
    for (let tick = 0; tick < 400; tick += 1) syncEnemyTiers(state, at, player, 0, 0.05)
    let watched: { x: number; y: number; z: number } | null = null
    for (let tick = 0; tick < 60 * 20; tick += 1) {
      player.z += velocity.z / 60
      stepEnemies(state, player, 1 / 60, velocity)
      stepEnemyProjectiles(state, player, 1 / 60, 0.01)
      const live = state.projectiles.find((projectile) => projectile.active)
      if (!live) continue
      if (!watched) watched = { ...live.velocity }
      else if (state.projectiles.some((p) => p.active)) {
        expect(live.velocity.x).toBeCloseTo(watched.x, 6)
        expect(live.velocity.y).toBeCloseTo(watched.y, 6)
        expect(live.velocity.z).toBeCloseTo(watched.z, 6)
        break
      }
    }
    expect(watched).not.toBeNull()
  })

  it('still fires when there is no interception solution', () => {
    // A target outrunning the shot has no meeting point. An enemy that held
    // its fire whenever the maths failed would simply go mute.
    const outrunning = interceptTime({ x: 0, y: 0, z: 60 }, { x: 0, y: 0, z: 90 }, 40)
    expect(outrunning).toBeNull()
    const catchable = interceptTime({ x: 0, y: 0, z: 60 }, { x: 0, y: 0, z: 10 }, 40)
    expect(catchable).toBeGreaterThan(0)
  })

  it('solves the intercept it claims to solve', () => {
    // A shot fired at the returned time must actually be where the target is.
    const toTarget = { x: 40, y: 6, z: -25 }
    const velocity = { x: -8, y: 1, z: 14 }
    const speed = 52
    const time = interceptTime(toTarget, velocity, speed)!
    expect(time).toBeGreaterThan(0)
    const meeting = {
      x: toTarget.x + velocity.x * time,
      y: toTarget.y + velocity.y * time,
      z: toTarget.z + velocity.z * time,
    }
    expect(Math.hypot(meeting.x, meeting.y, meeting.z)).toBeCloseTo(speed * time, 4)
  })
})

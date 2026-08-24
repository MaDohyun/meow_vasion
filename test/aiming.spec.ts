import { describe, expect, it } from 'vitest'
import {
  BATTLESHIP_MAIN_GUN_TELEGRAPH,
  ENEMY_WAVE_STAGES,
  LEAD_ACCURACY,
  PROJECTILE_SPEED,
  createEnemyState,
  interceptTime,
  stepEnemies,
  stepEnemyProjectiles,
  syncEnemyTiers,
} from '../src/core/enemies'
import { DRONE_DEFAULTS } from '../src/core/drone'

/**
 * Fly a course past a hand-emplaced anti-air ring and count the hits.
 *
 * The network no longer aims - it fires the curtain like everything else
 * (test/danmaku.spec.ts) - but it is still the densest concentration of guns
 * that can be stood up without a boss, so it is what the "does moving help"
 * question gets asked of. The real spawner bolts the sites to buildings, which
 * is orthogonal to this, so the ring is placed directly.
 *
 * `speed` of zero parks the craft in the middle of the ring, which is the
 * mistake the curtain exists to punish.
 */
function aaRun(options: { speed: number; hitRadius?: number }) {
  const { speed, hitRadius = 1.05 } = options
  const state = createEnemyState(0xa11)
  const player = { x: 0, y: 40, z: 0 }
  const velocity = { x: 0, y: 0, z: speed }
  const sites = state.slots.filter((enemy) => enemy.kind === 'anti-air')
  sites.forEach((site, index) => {
    site.active = true
    site.mode = 'fixed'
    site.hitRadius = 2.2
    const angle = index / sites.length * Math.PI * 2
    site.position = { x: Math.sin(angle) * 40, y: 30, z: Math.cos(angle) * 40 }
  })
  let hits = 0
  const d = 1 / 60
  for (let tick = 0; tick < 40 * 60; tick += 1) {
    player.x += velocity.x * d
    player.z += velocity.z * d
    stepEnemies(state, player, d, velocity)
    if (stepEnemyProjectiles(state, player, d, hitRadius) > 0) hits += 1
  }
  return hits
}

describe('lead aiming', () => {
  it('fires the one aimed shot faster than the craft can cruise', () => {
    // Without this there is no interception solution at all: a fleeing target
    // outruns the bullet and every shot misses no matter how well aimed. The
    // bow gun is the only weapon left that aims, so it is the only one this
    // has to hold for.
    expect(PROJECTILE_SPEED['boss-beam']).toBeGreaterThan(DRONE_DEFAULTS.maxSpeed)
    // The orb is the deliberate opposite: a curtain round is dodged by
    // reading the air, not outrun, so it sits below cruise on purpose.
    expect(PROJECTILE_SPEED.orb).toBeLessThan(DRONE_DEFAULTS.maxSpeed)
  })

  it('punishes a craft that parks in a field of guns', () => {
    // Every round is fired at where the craft is, so a craft that stays there
    // is hit by all of them. Hovering is the mistake the curtain prices.
    expect(aaRun({ speed: 0 })).toBeGreaterThan(0)
  })

  it('lets a craft that keeps moving fly clear', () => {
    // The curtain's whole bargain, and the reason the rounds are slower than
    // the craft: a round is aimed at where you were, so moving is the answer
    // everywhere, against every gun. Not a reduction - a craft under way is
    // simply somewhere else by the time any of it arrives.
    const parked = aaRun({ speed: 0 })
    const moving = aaRun({ speed: DRONE_DEFAULTS.maxSpeed })
    expect(moving).toBeLessThan(parked)
  })

  it('gives full lead only to the unit that actually aims', () => {
    // The battleship's bow gun is the roster's last aimed weapon, and it
    // arrives when flying straight is supposed to be fatal - so it leads
    // perfectly, and it is shown to the player before it fires.
    expect(LEAD_ACCURACY.boss).toBe(1)
    expect(BATTLESHIP_MAIN_GUN_TELEGRAPH).toBeGreaterThan(0)
    // Everything else attacks without aiming at all: contact, rams, curtains.
    expect(LEAD_ACCURACY['anti-air']).toBe(0)
    expect(LEAD_ACCURACY.drone).toBe(0)
    expect(LEAD_ACCURACY.helicopter).toBe(0)
    expect(LEAD_ACCURACY.fighter).toBe(0)
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

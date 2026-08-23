import { describe, expect, it } from 'vitest'
import {
  ENEMY_CAPS,
  ENEMY_WAVE_STAGES,
  createEnemyState,
  isDroneMine,
  mineTargetForTime,
  stepEnemies,
  syncEnemyTiers,
  type EnemyKind,
} from '../src/core/enemies'

/**
 * The units a wave keeps for the rest of the run.
 *
 * Anti-air is left out because it is attached to buildings rather than
 * spawned, and the boss because there is only ever one.
 */
const LASTING: EnemyKind[] = ['drone', 'helicopter', 'fighter', 'tank']

function targetAt(kind: EnemyKind, stage: number) {
  const targets = ENEMY_WAVE_STAGES[stage]!.targets as Partial<Record<EnemyKind, number>>
  return Math.min(ENEMY_CAPS[kind], targets[kind] ?? 0)
}

/**
 * Fly one heading at cruise while killing what a player kills, and report what
 * is within sight at each sample.
 *
 * The distinction this exists to catch: the wave table promising fifty-two
 * drones and the spawner delivering none is invisible to a test that only
 * reads the table.
 */
function flyPast(untilStage: number) {
  const state = createEnemyState(0x51de)
  const until = ENEMY_WAVE_STAGES[untilStage]!.at + 22
  let player = { x: 0, y: 14, z: 0 }
  for (let tick = 0; tick * 0.05 < until; tick += 1) {
    const elapsed = tick * 0.05
    player = { x: 0, y: 14, z: elapsed * 30 }
    syncEnemyTiers(state, elapsed, player, 0, 0.05)
    stepEnemies(state, player, 0.05)
    if (tick % 8 !== 0) continue
    let nearest: (typeof state.slots)[number] | null = null
    let best = Infinity
    for (const enemy of state.slots) {
      if (!enemy.active || enemy.kind === 'boss') continue
      const distance = Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z)
      if (distance < best) { best = distance; nearest = enemy }
    }
    if (nearest && best < 90) { nearest.active = false; nearest.respawn = 0.6 }
  }
  const inSight = (match: (enemy: (typeof state.slots)[number]) => boolean) => state.slots.filter((enemy) =>
    enemy.active && match(enemy)
    && Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z) < 150).length
  return {
    mines: inSight(isDroneMine),
    of: (kind: EnemyKind) => inSight((enemy) => enemy.kind === kind),
  }
}

describe('the wave mix', () => {
  it('never thins out a unit a previous wave introduced', () => {
    // Each wave is meant to add to the sky, not replace it. Once a kind is in,
    // its numbers only go up.
    for (const kind of LASTING) {
      let introduced = false
      for (let stage = 1; stage < ENEMY_WAVE_STAGES.length; stage += 1) {
        const previous = targetAt(kind, stage - 1)
        const current = targetAt(kind, stage)
        if (current > 0) introduced = true
        if (!introduced) continue
        expect(current, `${kind} at stage ${stage}`).toBeGreaterThanOrEqual(previous)
      }
      expect(targetAt(kind, ENEMY_WAVE_STAGES.length - 1), kind).toBeGreaterThan(0)
    }
    // And the earliest unit is still the bulk of the sky at the end, rather
    // than a rounding error next to the newest one.
    const last = ENEMY_WAVE_STAGES.length - 1
    expect(targetAt('drone', last)).toBeGreaterThan(targetAt('tank', last) * 3)
  })

  it('actually puts those units in front of a player who keeps flying', () => {
    // The spawner used to run a fixed priority list with drones at the back,
    // so by the fighter wave a player holding one heading met tanks and
    // fighters and no drones at all - the table said fifty-two and the sky
    // delivered none. Sampled after a long straight run with kills going in
    // the whole way, which is the case that exposed it.
    const early = flyPast(1)
    const late = flyPast(ENEMY_WAVE_STAGES.length - 1)

    expect(early.of('drone')).toBeGreaterThan(2)
    expect(early.mines).toBeGreaterThan(1)
    // Later waves add to that rather than crowding it out.
    expect(late.of('drone')).toBeGreaterThan(early.of('drone'))
    expect(late.mines).toBeGreaterThan(early.mines)
    expect(late.mines).toBeGreaterThan(mineTargetForTime(ENEMY_WAVE_STAGES.at(-1)!.at) * 0.4)
    // The newer waves are there too - this is a mix, not drones winning.
    expect(late.of('helicopter')).toBeGreaterThan(0)
    expect(late.of('fighter')).toBeGreaterThan(0)
    expect(late.of('tank')).toBeGreaterThan(0)
  })
})

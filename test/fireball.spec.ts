import { describe, expect, it } from 'vitest'
import {
  BLAST_PROFILE,
  FIREBALL_DURATION,
  FIREBALL_MAX,
  FIREBALL_PUFFS,
  createFireballPool,
  type BlastKind,
  fireballPuffCentre,
  fireballPuffProgress,
  fireballPuffRadius,
  stepFireballs,
  triggerFireball,
} from '../src/core/fireball'
import { DRONE_MINE_BLAST_RADIUS, DRONE_MINE_FUSE } from '../src/core/enemies'

const ORIGIN = { x: 0, y: 0, z: 0 }

/** stepFireballs clamps a tick to 50ms, so time has to be run, not jumped. */
function advance(pool: ReturnType<typeof createFireballPool>, seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 120) stepFireballs(pool, 1 / 120)
}

function centres(pool: ReturnType<typeof createFireballPool>, index = 0) {
  const fireball = pool[index]!
  const out = { x: 0, y: 0, z: 0 }
  return fireball.puffs.slice(0, fireball.puffCount).map((puff) => {
    const progress = fireballPuffProgress(fireball, puff)
    fireballPuffCentre(fireball, puff, progress, out)
    return {
      progress,
      distance: Math.hypot(out.x, out.y, out.z),
      reach: Math.hypot(out.x, out.y, out.z) + fireballPuffRadius(fireball, puff, progress),
    }
  })
}

describe('the blast a mine leaves behind', () => {
  it('gives a mine a second to go off and covers what it kills', () => {
    // The fuse is short enough that crossing the shell is a commitment rather
    // than a noise to fly away from, and the fire is sized off the same radius
    // the shell was drawing, so the two cannot disagree.
    expect(DRONE_MINE_FUSE).toBe(0.3)
    expect(DRONE_MINE_BLAST_RADIUS).toBeGreaterThan(7)

    const pool = createFireballPool()
    triggerFireball(pool, 'mine', ORIGIN, DRONE_MINE_BLAST_RADIUS)
    advance(pool, FIREBALL_DURATION * 0.85)
    const reach = Math.max(...centres(pool).map((puff) => puff.reach))
    expect(reach).toBeGreaterThan(DRONE_MINE_BLAST_RADIUS * 0.6)
    expect(reach).toBeLessThan(DRONE_MINE_BLAST_RADIUS * 1.5)
  })

  it('erupts from the middle rather than appearing at full size', () => {
    const pool = createFireballPool()
    triggerFireball(pool, 'mine', ORIGIN, 9)

    // On the first frame every lobe is still at the centre, and most of them
    // have not even started - a blast that pops in whole reads as a decal.
    advance(pool, 1 / 60)
    const opening = centres(pool)
    expect(opening.filter(({ progress }) => progress < 0).length).toBeGreaterThan(FIREBALL_PUFFS / 3)
    expect(Math.max(...opening.map(({ distance }) => distance))).toBeLessThan(1)

    // Half way through, lobes are out at a spread of distances: the late ones
    // are still near the core while the early ones have carried well out.
    advance(pool, FIREBALL_DURATION * 0.5)
    const spread = centres(pool).filter(({ progress }) => progress >= 0).map(({ distance }) => distance)
    // All but the last stragglers are out by now; those still to come are the
    // late white flashes that punch through the smoke at the tail.
    expect(spread.length).toBeGreaterThan(FIREBALL_PUFFS - 3)
    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(1)
  })

  it('swells each lobe from nothing and never lets one outlive the blast', () => {
    const pool = createFireballPool()
    const fireball = triggerFireball(pool, 'mine', ORIGIN, 9)
    const puff = fireball.puffs[FIREBALL_PUFFS - 1]!
    expect(fireballPuffRadius(fireball, puff, 0)).toBeLessThan(fireballPuffRadius(fireball, puff, 1))

    advance(pool, FIREBALL_DURATION + 0.2)
    expect(fireball.active).toBe(false)
    // Every lobe is finished the moment the blast is, so nothing is left
    // hanging in the air waiting for its own timer.
    for (const item of fireball.puffs.slice(0, fireball.puffCount)) {
      expect(fireballPuffProgress(fireball, item)).toBeGreaterThanOrEqual(1)
    }
  })

  it('recycles the oldest blast rather than dropping a new one', () => {
    const pool = createFireballPool()
    for (let index = 0; index < FIREBALL_MAX; index += 1) {
      triggerFireball(pool, 'mine', { x: index, y: 0, z: 0 }, 9, index)
      advance(pool, 0.05)
    }
    expect(pool.every((fireball) => fireball.active)).toBe(true)
    const oldest = pool.reduce((best, item) => (item.age > best.age ? item : best))
    const reused = triggerFireball(pool, 'mine', { x: 99, y: 4, z: 7 }, 9, 99)
    expect(reused).toBe(oldest)
    expect(reused.age).toBe(0)
    expect(reused.position).toEqual({ x: 99, y: 4, z: 7 })
  })

  it('scales a blast to what caused it', () => {
    // A laser scoring a wall and a fuel depot going up share one effect, so
    // the ladder between them is what keeps either from reading wrong: a wall
    // scorch the size of a bus is a bug, a depot going up with a puff is
    // nothing happening.
    const order: BlastKind[] = ['strike', 'aircraft', 'vehicle', 'ruin', 'mine', 'landmark', 'battleship']
    for (let index = 1; index < order.length; index += 1) {
      const smaller = BLAST_PROFILE[order[index - 1]!]
      const bigger = BLAST_PROFILE[order[index]!]
      expect(bigger.radius, order[index]).toBeGreaterThan(smaller.radius)
      expect(bigger.duration, order[index]).toBeGreaterThanOrEqual(smaller.duration)
    }
    // A wall hit has to be gone before the next shot can land, or holding the
    // trigger on a tower buries it in fire.
    expect(BLAST_PROFILE.strike.duration).toBeLessThan(0.27)
    expect(BLAST_PROFILE.battleship.radius).toBeGreaterThan(BLAST_PROFILE.landmark.radius * 1.5)

    const pool = createFireballPool()
    const strike = triggerFireball(pool, 'strike', ORIGIN)
    expect(strike.puffCount).toBe(BLAST_PROFILE.strike.puffs)
    expect(strike.puffCount).toBeLessThan(FIREBALL_PUFFS)
    expect(strike.radius).toBe(BLAST_PROFILE.strike.radius)
    // Still a blast, not a single ball: even the smallest one erupts.
    expect(strike.puffCount).toBeGreaterThan(1)
    advance(pool, BLAST_PROFILE.strike.duration * 0.6)
    expect(Math.max(...centres(pool).map((puff) => puff.reach))).toBeLessThan(BLAST_PROFILE.aircraft.radius)
  })

  it('reuses every slot of the array whatever size the last blast was', () => {
    // The puff array is always full length so a small blast allocates nothing;
    // a big one after it has to get all its lobes back.
    const pool = createFireballPool()
    triggerFireball(pool, 'strike', ORIGIN)
    const big = triggerFireball(pool, 'landmark', ORIGIN, undefined, 4)
    expect(big.puffCount).toBe(BLAST_PROFILE.landmark.puffs)
    expect(big.puffs).toHaveLength(FIREBALL_PUFFS)
    const spread = new Set(big.puffs.slice(0, big.puffCount).map((puff) => puff.delay.toFixed(4)))
    expect(spread.size).toBeGreaterThan(big.puffCount / 2)
  })

  it('varies one blast from the next in the same spot', () => {
    const pool = createFireballPool()
    const first = triggerFireball(pool, 'mine', ORIGIN, 9, 1).puffs.map((puff) => puff.radius)
    const second = triggerFireball(pool, 'mine', ORIGIN, 9, 2).puffs.map((puff) => puff.radius)
    expect(first).not.toEqual(second)
  })
})

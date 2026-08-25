import { describe, expect, it } from 'vitest'
import {
  AUTO_TARGET_GRAB,
  AUTO_TARGET_RELEASE,
  AUTO_TARGET_SILHOUETTE_MAX,
  aimDistance,
  collectAutoTargets,
  pickAutoTarget,
  type AutoTargetCandidate,
  type AutoTargetProjector,
} from '../src/core/autoTarget'
import { BATTLESHIP_TURRETS, createEnemyState, type EnemyKind, type EnemySlot } from '../src/core/enemies'

const ASPECT = 16 / 9
const CENTRE = { x: 0, y: 0 }

/** A contact placed by hand, for the rules that are about the screen only. */
function contact(overrides: Partial<AutoTargetCandidate> = {}): AutoTargetCandidate {
  return { id: 'enemy:fighter:0:0', kind: 'fighter', x: 0, y: 0, radius: 0.02, depth: 60, ...overrides }
}

/**
 * The same pinhole the render pass uses, written out: a camera at the origin
 * looking down +z, half-height `TANGENT` radians, x stretched by the aspect.
 */
const TANGENT = Math.tan(Math.PI / 6)
const pinhole: AutoTargetProjector = (point, radius) => {
  const depth = point.z
  if (depth <= 0) return null
  return {
    x: point.x / (depth * TANGENT * ASPECT),
    y: -point.y / (depth * TANGENT),
    radius: radius / (depth * TANGENT),
    depth,
  }
}

function wake(state: ReturnType<typeof createEnemyState>, kind: EnemyKind, place: Partial<EnemySlot> = {}) {
  const enemy = state.slots.find((slot) => slot.kind === kind && !slot.active)!
  enemy.active = true
  enemy.hp = enemy.maxHp
  enemy.hitRadius = kind === 'boss' ? 9.5 : 2.4
  enemy.position.x = 0
  enemy.position.y = 0
  enemy.position.z = 60
  Object.assign(enemy, place)
  return enemy
}

describe('what the magnet may take', () => {
  it('takes every machine in the sky', () => {
    const state = createEnemyState()
    for (const kind of ['drone', 'helicopter', 'fighter'] as const) wake(state, kind)
    const kinds = collectAutoTargets(state.slots, pinhole).map((candidate) => candidate.kind)
    expect(new Set(kinds)).toEqual(new Set(['drone', 'helicopter', 'fighter']))
  })

  it('never offers anything that is not an enemy', () => {
    // The city is not in the list because the list is built from the enemy
    // pool - which is the whole of the rule. A tower, a car or a pedestrian
    // has no way to reach the reticle, whatever the cursor is over.
    const state = createEnemyState()
    wake(state, 'fighter')
    wake(state, 'drone')
    for (const candidate of collectAutoTargets(state.slots, pinhole)) {
      expect(candidate.id.startsWith('enemy:')).toBe(true)
    }
  })

  it('drops what has stopped being a target', () => {
    const state = createEnemyState()
    const dying = wake(state, 'helicopter')
    expect(collectAutoTargets(state.slots, pinhole)).toHaveLength(1)
    dying.hp = 0
    expect(collectAutoTargets(state.slots, pinhole)).toHaveLength(0)
    dying.hp = dying.maxHp
    dying.absorbing = true
    expect(collectAutoTargets(state.slots, pinhole)).toHaveLength(0)
  })

  it('refuses what is behind the eye', () => {
    const state = createEnemyState()
    wake(state, 'fighter', { position: { x: 0, y: 0, z: -40 } })
    expect(collectAutoTargets(state.slots, pinhole)).toHaveLength(0)
  })

  it('traces the dreadnought station by station', () => {
    // One sphere over a seventy-four metre hull would drag every shot at the
    // bow back to amidships, so the ship enters as its turret line - the same
    // shape the laser's own hit spheres take.
    const state = createEnemyState()
    const ship = wake(state, 'boss', { position: { x: 0, y: 0, z: 140 } })
    // Broadside on, so the turret line runs across the screen rather than
    // away from it and the stations are six places to point at.
    ship.rotation.y = Math.PI / 2
    const stations = collectAutoTargets(state.slots, pinhole)
    expect(stations).toHaveLength(BATTLESHIP_TURRETS.length)
    expect(new Set(stations.map((station) => station.id))).toEqual(new Set([ship.id]))
    expect(new Set(stations.map((station) => station.x)).size).toBe(BATTLESHIP_TURRETS.length)
  })

  it('reuses its array rather than allocating one a frame', () => {
    const state = createEnemyState()
    wake(state, 'fighter')
    const pool: AutoTargetCandidate[] = []
    const first = collectAutoTargets(state.slots, pinhole, pool)
    const second = collectAutoTargets(state.slots, pinhole, pool)
    expect(first).toBe(pool)
    expect(second[0]).toBe(first[0])
  })
})

describe('picking a contact', () => {
  it('leaves the cursor alone out in the open', () => {
    expect(pickAutoTarget([contact({ x: 0.6, y: 0.5 })], CENTRE, ASPECT)).toBeNull()
  })

  it('grabs what the cursor is very nearly on', () => {
    const lock = pickAutoTarget([contact({ x: 0.03, y: 0.03 })], CENTRE, ASPECT)
    expect(lock?.id).toBe('enemy:fighter:0:0')
    // The reticle stands on the contact, not where the hand left it.
    expect(lock?.x).toBeCloseTo(0.03)
  })

  it('keeps the ring round on a wide screen', () => {
    // Half the screen height at 16:9 is well short of half its width, so a
    // hypot that ignored the aspect would reach much further sideways than up.
    const sideways = contact({ x: AUTO_TARGET_GRAB, y: 0 })
    const upward = contact({ x: 0, y: AUTO_TARGET_GRAB })
    expect(pickAutoTarget([upward], CENTRE, ASPECT)).not.toBeNull()
    expect(pickAutoTarget([sideways], CENTRE, ASPECT)).toBeNull()
    expect(aimDistance(sideways, CENTRE, ASPECT)).toBeCloseTo(AUTO_TARGET_GRAB * ASPECT)
  })

  it('measures the ring off the silhouette', () => {
    // A dreadnought station fills the screen where a distant mine is four
    // pixels across, so pointing at the ship is pointing at the ship.
    const offset = AUTO_TARGET_GRAB + 0.05
    expect(pickAutoTarget([contact({ y: offset, radius: 0.002 })], CENTRE, ASPECT)).toBeNull()
    expect(pickAutoTarget([contact({ y: offset, kind: 'boss', radius: 0.12 })], CENTRE, ASPECT)).not.toBeNull()
  })

  it('caps what a silhouette may add', () => {
    // A dreadnought station at close quarters projects a sphere a third of the
    // screen wide. Uncapped, the sky beside the ship would snap onto a gun; the
    // cap keeps even the biggest thing in the game asking to be pointed at.
    const alongside = contact({ kind: 'boss', radius: 0.5, y: AUTO_TARGET_GRAB + AUTO_TARGET_SILHOUETTE_MAX + 0.02 })
    expect(pickAutoTarget([alongside], CENTRE, ASPECT)).toBeNull()
    expect(pickAutoTarget([{ ...alongside, y: AUTO_TARGET_GRAB + 0.05 }], CENTRE, ASPECT)).not.toBeNull()
  })

  it('never reaches a quarter of the way across the screen', () => {
    // The magnet pays for the pixel the cursor missed by, not for an aim the
    // player never took. Whatever is on screen and however close it is, the
    // ring stays a short reach - this is the number to look at first if it
    // ever reads as the game taking the hand.
    expect(AUTO_TARGET_GRAB + AUTO_TARGET_SILHOUETTE_MAX).toBeLessThan(0.28)
    expect(AUTO_TARGET_RELEASE).toBeLessThan(AUTO_TARGET_GRAB * 2)
  })

  it('takes the one the cursor is most on', () => {
    const near = contact({ id: 'enemy:drone:1:0', kind: 'drone', x: 0.01, y: 0 })
    const far = contact({ id: 'enemy:drone:2:0', kind: 'drone', x: -0.05, y: 0.04 })
    expect(pickAutoTarget([far, near], CENTRE, ASPECT)?.id).toBe('enemy:drone:1:0')
  })

  it('breaks a dead heat on the nearer contact', () => {
    const behind = contact({ id: 'enemy:drone:1:0', kind: 'drone', depth: 120 })
    const ahead = contact({ id: 'enemy:drone:2:0', kind: 'drone', depth: 30 })
    expect(pickAutoTarget([behind, ahead], CENTRE, ASPECT)?.id).toBe('enemy:drone:2:0')
  })
})

describe('holding a lock', () => {
  const held = 'enemy:helicopter:0:0'
  const helicopter = (y: number) => contact({ id: held, kind: 'helicopter', y })

  it('holds on out to the wider ring, and lets go past it', () => {
    const drifting = helicopter(AUTO_TARGET_GRAB + 0.04)
    // Nothing would have grabbed it out here...
    expect(pickAutoTarget([drifting], CENTRE, ASPECT)).toBeNull()
    // ...but a lock already made survives the drift, which is what stops the
    // reticle strobing gold at the edge of the ring.
    expect(pickAutoTarget([drifting], CENTRE, ASPECT, held)?.id).toBe(held)
    expect(pickAutoTarget([helicopter(AUTO_TARGET_RELEASE + 0.08)], CENTRE, ASPECT, held)).toBeNull()
  })

  it('is not stolen by a swarm crossing the cursor', () => {
    const mine = contact({ id: 'enemy:drone:3:0', kind: 'drone', y: -(AUTO_TARGET_GRAB * 0.9) })
    const lock = pickAutoTarget([helicopter(AUTO_TARGET_GRAB + 0.03), mine], CENTRE, ASPECT, held)
    expect(lock?.id).toBe(held)
  })

  it('hands over when the cursor genuinely moves onto something else', () => {
    const mine = contact({ id: 'enemy:drone:3:0', kind: 'drone', y: -0.01 })
    const lock = pickAutoTarget([helicopter(AUTO_TARGET_GRAB + 0.03), mine], CENTRE, ASPECT, held)
    expect(lock?.id).toBe('enemy:drone:3:0')
  })

  it('releases what has been shot down', () => {
    expect(pickAutoTarget([], CENTRE, ASPECT, held)).toBeNull()
  })

  it('follows the dreadnought station under the cursor', () => {
    // Every station carries the ship's id, so a lock on the bow is still a
    // lock on the ship - and sweeping along the hull walks the reticle down
    // the turret line instead of snapping back amidships.
    const ship = 'enemy:boss:0:0'
    const bow = contact({ id: ship, kind: 'boss', x: -0.02, y: 0, radius: 0.06 })
    const stern = contact({ id: ship, kind: 'boss', x: 0.3, y: 0, radius: 0.06 })
    expect(pickAutoTarget([bow, stern], CENTRE, ASPECT, ship)?.x).toBeCloseTo(-0.02)
  })
})

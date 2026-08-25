/**
 * The reticle's magnet.
 *
 * A UFO is not a rifle. The craft flies where it looks, so the same hand that
 * aims is the hand that steers, and a fighter crossing the screen at pass
 * speed has to be tracked by flying at it - which is exactly what the player
 * is already busy not doing while a mine field goes by underneath. The laser
 * asks for pixel accuracy from a control that was never a pointing device.
 *
 * So the reticle is given a small magnet, and only for the sky. Bring the
 * cursor very close to something flying and the reticle steps onto it and
 * turns gold; everything the laser is also allowed to shoot - towers, cars,
 * people, street furniture - keeps asking for the pixel, because those do not
 * move and hitting them is not the problem this exists to solve.
 *
 * Two properties make it feel like assistance rather than like the game
 * playing itself:
 *
 * - The ring is small. It is measured off the target's own silhouette on
 *   screen (see `grabRadius`), so a helicopter filling a third of the view is
 *   grabbed by pointing at the helicopter, and a drone that is four pixels
 *   across is grabbed by putting the cursor on those four pixels plus a
 *   thumb's width. Nothing is caught from across the screen.
 * - Steering never sees it. `aimSteer` reads the raw pointer, so the craft
 *   turns where the hand asked and only the shot is snapped. A magnet that
 *   also grabbed the yaw would fly the ship, and pulling out of a lock would
 *   mean fighting the autopilot.
 *
 * Pure, and deliberately blind to three.js: the caller hands over a way to
 * project a world point, which is the only thing here that needs a camera.
 */

import { BATTLESHIP_TURRETS, battleshipTurretPoint, type EnemyKind, type EnemySlot } from './enemies'
import type { Vec3 } from './drone'

/**
 * A target as the screen sees it.
 *
 * `x`/`y` are in the reticle's own frame - the one `aim.ts` produces, -1 at
 * the left/top edge and +1 at the right/bottom - so a lock can be handed
 * straight to the HUD and to the aim raycast without a second conversion.
 *
 * `radius` is the silhouette's half-height in the *vertical* half of that
 * frame, and every distance here is measured in those units: the horizontal
 * axis is stretched by the aspect ratio, so a plain hypot over x and y would
 * make the ring an ellipse and the magnet visibly stronger sideways.
 */
export type AutoTargetCandidate = {
  id: string
  kind: EnemyKind
  x: number
  y: number
  radius: number
  /** Metres from the eye. Only breaks ties between overlapping contacts. */
  depth: number
}

export type AutoTargetLock = {
  id: string
  kind: EnemyKind
  x: number
  y: number
}

/**
 * Projects a world point, or refuses to.
 *
 * Null means the point is behind the eye, where a perspective divide would
 * mirror it onto the screen and hand the magnet a target sitting in the
 * player's wake.
 */
export type AutoTargetProjector = (point: Vec3, radius: number) =>
  | { x: number; y: number; radius: number; depth: number }
  | null

/**
 * How much slack the ring has beyond the target's own outline, as a fraction
 * of half the screen height.
 *
 * About twenty pixels at a laptop's height. It is what makes a distant mine -
 * a few pixels of contact - grabbable at all, and it is small enough that two
 * contacts a hand apart are still two separate things to point at.
 *
 * It started half again this wide and read as the game taking the hand rather
 * than steadying it. The rule the number has to satisfy is narrow: the magnet
 * pays for the pixel the cursor missed by, not for the aim the player never
 * took.
 */
export const AUTO_TARGET_GRAB = 0.065

/**
 * The wider ring a lock has to leave before it breaks.
 *
 * Without it a target sitting exactly on the edge of the grab ring flickers
 * between locked and free every frame the craft rolls, and the reticle
 * strobes gold. Leaving is a deliberate movement; entering is not.
 *
 * Kept at about 1.6x the grab ring: the gap is what makes the lock steady, so
 * easing the magnet means shrinking both together rather than closing it.
 */
export const AUTO_TARGET_RELEASE = 0.105

/**
 * How much of a target's own silhouette counts towards its ring.
 *
 * Not all of it. Pointing at the edge of a shape is pointing at the shape, but
 * a sphere's projection is generous - a hit sphere is drawn around the widest
 * part of the machine, not around what the player reads as its body - so the
 * full radius grabbed from noticeably outside the outline.
 */
export const AUTO_TARGET_SILHOUETTE = 0.6

/**
 * The most a silhouette may add, however close the target is.
 *
 * This is the dreadnought's clause. Its turret spheres are eight metres across
 * and at close quarters one covers a third of the screen, so an uncapped ring
 * meant that anywhere near the ship - the sky beside it included - snapped the
 * reticle onto a gun. Capped, the magnet asks for the hull the way it asks for
 * everything else: put the cursor roughly on it.
 */
export const AUTO_TARGET_SILHOUETTE_MAX = 0.2

/**
 * How deep inside its own ring a new contact must be to steal a live lock.
 *
 * A swarm crosses the cursor constantly, and a magnet that always took the
 * nearest thing would hop between mines while the player is trying to hold a
 * helicopter. Merely entering the ring is not enough; the cursor has to be
 * more than halfway onto the newcomer.
 */
export const AUTO_TARGET_STEAL = 0.55

/** Nothing closer than this to the eye is a target - it is the eye. */
const MIN_DEPTH = 0.5

/** How much of this contact's outline its ring is allowed to inherit. */
function silhouette(candidate: AutoTargetCandidate) {
  return Math.min(AUTO_TARGET_SILHOUETTE_MAX, candidate.radius * AUTO_TARGET_SILHOUETTE)
}

function grabRadius(candidate: AutoTargetCandidate) {
  return AUTO_TARGET_GRAB + silhouette(candidate)
}

function releaseRadius(candidate: AutoTargetCandidate) {
  return AUTO_TARGET_RELEASE + silhouette(candidate)
}

/** Distance from the cursor to a contact, in half-screen-height units. */
export function aimDistance(candidate: AutoTargetCandidate, aim: { x: number; y: number }, aspect: number) {
  return Math.hypot((candidate.x - aim.x) * Math.max(0.0001, aspect), candidate.y - aim.y)
}

const TURRET_POINT: Vec3 = { x: 0, y: 0, z: 0 }

/**
 * Everything in the sky that the magnet may take, and nothing else.
 *
 * The list is built from the enemy pool alone, which is the whole of the
 * rule: the city is never a candidate, so no amount of pointing at a tower or
 * a parked car turns the reticle gold.
 *
 * The dreadnought is a seventy-four metre slab and enters as one candidate per
 * turret station, the same way it enters the laser's hit spheres - one sphere
 * over the whole hull would put the lock amidships wherever the player pointed
 * and drag every shot at the bow back to the middle of the ship.
 *
 * Writes into `into` and returns it, so the per-frame call allocates nothing.
 */
export function collectAutoTargets(
  enemies: Iterable<EnemySlot>,
  project: AutoTargetProjector,
  into: AutoTargetCandidate[] = [],
): AutoTargetCandidate[] {
  let slot = 0
  const push = (id: string, kind: EnemyKind, point: Vec3, radius: number) => {
    const projected = project(point, radius)
    if (!projected || projected.depth <= MIN_DEPTH) return
    const candidate = into[slot] ?? { id, kind, x: 0, y: 0, radius: 0, depth: 0 }
    candidate.id = id
    candidate.kind = kind
    candidate.x = projected.x
    candidate.y = projected.y
    candidate.radius = projected.radius
    candidate.depth = projected.depth
    into[slot] = candidate
    slot += 1
  }
  for (const enemy of enemies) {
    if (!enemy.active || enemy.absorbing || enemy.hp <= 0) continue
    if (enemy.kind === 'boss') {
      for (let station = 0; station < BATTLESHIP_TURRETS.length; station += 1) {
        battleshipTurretPoint(enemy, station, TURRET_POINT)
        push(enemy.id, 'boss', TURRET_POINT, 8)
      }
      continue
    }
    push(enemy.id, enemy.kind, enemy.position, enemy.hitRadius)
  }
  into.length = slot
  return into
}

/**
 * Which contact the reticle sits on this frame, or null for a free cursor.
 *
 * `held` is last frame's answer, and it is what turns a threshold into a
 * behaviour: a lock survives out to the release ring and is only taken off it
 * by a contact the cursor has genuinely moved onto.
 */
export function pickAutoTarget(
  candidates: AutoTargetCandidate[],
  aim: { x: number; y: number },
  aspect: number,
  held: string | null = null,
): AutoTargetLock | null {
  let lock: AutoTargetCandidate | null = null
  let lockScore = Number.POSITIVE_INFINITY
  let stay: AutoTargetCandidate | null = null
  let stayScore = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const distance = aimDistance(candidate, aim, aspect)
    if (held !== null && candidate.id === held) {
      const score = distance / releaseRadius(candidate)
      if (score < stayScore) {
        stayScore = score
        stay = candidate
      }
    }
    const score = distance / grabRadius(candidate)
    if (score > 1) continue
    if (score < lockScore || (score === lockScore && lock !== null && candidate.depth < lock.depth)) {
      lockScore = score
      lock = candidate
    }
  }
  if (stay !== null && stayScore <= 1 && (lock === null || lock.id === held || lockScore > AUTO_TARGET_STEAL)) {
    return { id: stay.id, kind: stay.kind, x: stay.x, y: stay.y }
  }
  return lock === null ? null : { id: lock.id, kind: lock.kind, x: lock.x, y: lock.y }
}

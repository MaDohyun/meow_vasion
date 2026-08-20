import type { BeamObject } from './beam'
import { seedForWorldCell, WORLD_CELL_SIZE } from './world'

/**
 * Ground explosives - fuel drums and gas canisters.
 *
 * These exist to give the widening beam something to punish. A grown craft
 * sweeps a wider cone, so it snags these more easily, and that is the cost of
 * growing rather than a flat speed tax.
 *
 * They must never be a gotcha. The game spends the whole run teaching "absorb
 * everything", so a hazard that only reveals itself after it is swallowed reads
 * as unfair. Every one of these is marked from a distance, stays marked while it
 * hangs from the beam, and can be dumped with the release key right up until it
 * reaches the craft. Getting caught by one should be a misread, never a
 * surprise.
 */

export const HAZARD_MAX = 26
export const HAZARD_MASS = 1.35
/** Detonates once it is drawn this close to the craft. */
export const HAZARD_TRIGGER_DISTANCE = 3.4
export const HAZARD_HP = 1

export type Hazard = BeamObject & {
  kind: 'explosive'
  slot: number
  generation: number
  cellX: number
  cellZ: number
  /** Rises as it is pulled in, so the warning gets louder the worse it gets. */
  alarm: number
  detonated: boolean
}

export type HazardState = {
  objects: Hazard[]
  randomState: number
  spawnTimer: number
}

export type HazardView = {
  position: { x: number; y: number; z: number }
  heading: number
  /** Explosives appear as the raid escalates, not from the first second. */
  elapsed: number
}

/** How many should be live at a given point in the run. */
export function hazardTargetForTime(elapsed: number) {
  if (elapsed < 25) return 0
  return Math.min(HAZARD_MAX, Math.floor((elapsed - 25) / 12) + 3)
}

function makeHazard(slot: number): Hazard {
  return {
    id: `hazard:${slot}:0`,
    kind: 'explosive',
    slot,
    generation: 0,
    cellX: 0,
    cellZ: 0,
    mass: HAZARD_MASS,
    color: '#ff4a3d',
    position: { x: 0, y: 0.8, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    active: false,
    inBeam: false,
    tether: 0,
    playerTouched: false,
    destroying: false,
    destroyTimer: 0,
    explosionPending: false,
    absorbing: false,
    absorbTimer: 0,
    alarm: 0,
    detonated: false,
  }
}

export function createHazardState(seed = 0x5eed17): HazardState {
  return {
    objects: Array.from({ length: HAZARD_MAX }, (_, slot) => makeHazard(slot)),
    randomState: seed >>> 0 || 1,
    spawnTimer: 0,
  }
}

function random(state: HazardState) {
  let value = state.randomState || 1
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  state.randomState = value >>> 0 || 1
  return state.randomState / 0xffffffff
}

export function activeHazardCount(state: HazardState) {
  let count = 0
  for (const hazard of state.objects) if (hazard.active) count += 1
  return count
}

function spawnHazard(state: HazardState, view: HazardView) {
  const hazard = state.objects.find((item) => !item.active)
  if (!hazard) return false
  // Placed in the arc the player is flying into, like crowds, so they are
  // actually encountered rather than left behind.
  const angle = view.heading + (random(state) - 0.5) * 2.1
  const distance = 60 + random(state) * 46
  const x = view.position.x + Math.sin(angle) * distance
  const z = view.position.z + Math.cos(angle) * distance
  hazard.cellX = Math.round(x / WORLD_CELL_SIZE)
  hazard.cellZ = Math.round(z / WORLD_CELL_SIZE)
  hazard.generation += 1
  hazard.id = `hazard:${hazard.slot}:${hazard.generation}`
  hazard.position.x = x
  hazard.position.y = 0.8
  hazard.position.z = z
  hazard.rotation.x = 0
  hazard.rotation.y = seedForWorldCell(hazard.cellX, hazard.cellZ, 0x4a2d) % 360 / 180 * Math.PI
  hazard.rotation.z = 0
  hazard.velocity.x = 0
  hazard.velocity.y = 0
  hazard.velocity.z = 0
  hazard.angularVelocity.x = 0
  hazard.angularVelocity.y = 0
  hazard.angularVelocity.z = 0
  hazard.active = true
  hazard.inBeam = false
  hazard.tether = 0
  hazard.playerTouched = false
  hazard.destroying = false
  hazard.destroyTimer = 0
  hazard.explosionPending = false
  hazard.absorbing = false
  hazard.absorbTimer = 0
  hazard.alarm = 0
  hazard.detonated = false
  return true
}

export const HAZARD_REMOVE_DISTANCE = 130

export function stepHazards(state: HazardState, view: HazardView, dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  const target = hazardTargetForTime(view.elapsed)
  state.spawnTimer -= d
  for (const hazard of state.objects) {
    if (!hazard.active) continue
    const held = hazard.inBeam || hazard.tether > 0.02
    // Alarm climbs while held and decays when let go, so releasing visibly
    // defuses the situation.
    hazard.alarm = held
      ? Math.min(1, hazard.alarm + d * 1.9)
      : Math.max(0, hazard.alarm - d * 1.4)
    if (held) continue
    const distance = Math.hypot(hazard.position.x - view.position.x, hazard.position.z - view.position.z)
    if (distance > HAZARD_REMOVE_DISTANCE) hazard.active = false
  }
  if (state.spawnTimer <= 0 && activeHazardCount(state) < target) {
    state.spawnTimer = spawnHazard(state, view) ? 0.4 : 1.2
  }
  return state
}

/**
 * Returns the hazard that just reached the craft, if any. The caller decides
 * what a detonation costs; this only reports it.
 */
export function detonateReachedHazard(state: HazardState, craftPosition: { x: number; y: number; z: number }) {
  for (const hazard of state.objects) {
    if (!hazard.active || hazard.detonated) continue
    if (!hazard.inBeam && hazard.tether <= 0.02) continue
    const distance = Math.hypot(
      hazard.position.x - craftPosition.x,
      hazard.position.y - craftPosition.y,
      hazard.position.z - craftPosition.z,
    )
    if (distance > HAZARD_TRIGGER_DISTANCE) continue
    hazard.detonated = true
    hazard.active = false
    hazard.inBeam = false
    hazard.tether = 0
    hazard.explosionPending = true
    return hazard
  }
  return null
}

/** Shot from range instead of swallowed - the laser's job. */
export function destroyHazard(state: HazardState, id: string) {
  for (const hazard of state.objects) {
    if (!hazard.active || hazard.id !== id) continue
    hazard.active = false
    hazard.inBeam = false
    hazard.tether = 0
    hazard.explosionPending = true
    return hazard
  }
  return null
}

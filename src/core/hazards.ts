import type { BeamObject } from './beam'
import { gasStationsAround } from './cityLandmarks'
import { seedForWorldCell, WORLD_CELL_SIZE } from './world'

/**
 * Heavy road vehicles - tankers and box trucks.
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

/**
 * Trucks: weight with no catch.
 *
 * The tanker was the only heavy thing on the road, which made every heavy
 * silhouette a threat and turned the whole weight mechanic into a warning
 * sign. A truck is the other half of that lesson - it is genuinely worth
 * eating, it is genuinely slow to lift, and it is the object that teaches the
 * ballast meter without costing a life. It reads as a truck at a glance: a
 * square box body against the tanker's cylinder.
 */
export type HeavyVehicleKind = 'explosive' | 'truck'

export const HAZARD_MAX = 34
export const TRUCK_MASS = 12.4
export const TRUCK_DIAMETER = 4.2
/** Tripled with the other inert masses: a tanker is the heaviest thing the
 *  beam can pick up and should be the slowest to come up. */
export const HAZARD_MASS = 18.6
/** Detonates once it is drawn this close to the craft. */
export const HAZARD_TRIGGER_DISTANCE = 3.4
export const HAZARD_HP = 1

export type Hazard = BeamObject & {
  kind: HeavyVehicleKind
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

/**
 * How many tankers should be live at a given point in the run.
 *
 * Thinned right down. At the old rate they were the most common heavy vehicle
 * on the map, so a full beam was more likely to be holding a bomb than a
 * haul - which is backwards. They are a hazard; hazards want to be a thing you
 * notice, not the ambient traffic.
 */
export function hazardTargetForTime(elapsed: number) {
  if (elapsed < 25) return 0
  return Math.min(11, Math.floor((elapsed - 25) / 26) + 2)
}

/**
 * Trucks fill the road from the first second. They are the traffic the tankers
 * used to be, minus the punishment.
 */
export function truckTargetForTime(elapsed: number) {
  return Math.min(16, 5 + Math.floor(Math.max(0, elapsed) / 30))
}

function makeHazard(slot: number): Hazard {
  return {
    id: `hazard:${slot}:0`,
    // Slots carry the tanker shape until a spawn assigns one; kind is only
    // meaningful on a live vehicle.
    kind: 'explosive',
    slot,
    generation: 0,
    cellX: 0,
    cellZ: 0,
    mass: HAZARD_MASS,
    color: '#ff4a3d',
    position: { x: 0, y: 1.25, z: 0 },
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
    diameter: 5.1,
    scoreValue: 240,
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

export function activeHazardCount(state: HazardState, kind?: HeavyVehicleKind) {
  let count = 0
  for (const hazard of state.objects) if (hazard.active && (!kind || hazard.kind === kind)) count += 1
  return count
}

function spawnHazard(state: HazardState, view: HazardView, kind: HeavyVehicleKind) {
  const hazard = state.objects.find((item) => !item.active)
  if (!hazard) return false
  // Placed in the arc the player is flying into, like crowds, so they are
  // actually encountered rather than left behind.
  const angle = view.heading + (random(state) - 0.5) * 2.1
  const distance = 60 + random(state) * 46
  let x = view.position.x + Math.sin(angle) * distance
  let z = view.position.z + Math.cos(angle) * distance
  // A tanker prefers a forecourt it could have pulled out of. Gas stations are
  // already placed as the tankers' explanation; before this they were scenery
  // and the tankers appeared anywhere, so the two never met.
  if (kind === 'explosive') {
    const stations = gasStationsAround(view.position, 5).filter((station) => {
      const dx = station.x - view.position.x
      const dz = station.z - view.position.z
      const range = Math.hypot(dx, dz)
      if (range < 45 || range > 150) return false
      return (dx * Math.sin(view.heading) + dz * Math.cos(view.heading)) / range > 0.1
    })
    const station = stations[Math.floor(random(state) * stations.length)]
    if (station) {
      x = station.x + (random(state) - 0.5) * 16
      z = station.z + (random(state) - 0.5) * 16
    }
  }
  hazard.kind = kind
  hazard.mass = kind === 'truck' ? TRUCK_MASS : HAZARD_MASS
  hazard.diameter = kind === 'truck' ? TRUCK_DIAMETER : 5.1
  hazard.scoreValue = kind === 'truck' ? 160 : 240
  hazard.color = kind === 'truck' ? '#7f93b8' : '#ff4a3d'
  hazard.cellX = Math.round(x / WORLD_CELL_SIZE)
  hazard.cellZ = Math.round(z / WORLD_CELL_SIZE)
  hazard.generation += 1
  hazard.id = `hazard:${hazard.slot}:${hazard.generation}`
  hazard.position.x = x
  hazard.position.y = 1.25
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
    // defuses the situation. A truck has nothing to warn about - it is just
    // heavy - so it never raises one.
    hazard.alarm = held && hazard.kind === 'explosive'
      ? Math.min(1, hazard.alarm + d * 1.9)
      : Math.max(0, hazard.alarm - d * 1.4)
    if (held) continue
    const distance = Math.hypot(hazard.position.x - view.position.x, hazard.position.z - view.position.z)
    if (distance > HAZARD_REMOVE_DISTANCE) hazard.active = false
  }
  if (state.spawnTimer <= 0) {
    // Tankers first when both are short: they are the rarer of the two and
    // would otherwise never get a slot once the trucks filled the pool.
    const wanted: HeavyVehicleKind | null = activeHazardCount(state, 'explosive') < target
      ? 'explosive'
      : activeHazardCount(state, 'truck') < truckTargetForTime(view.elapsed)
        ? 'truck'
        : null
    if (wanted) state.spawnTimer = spawnHazard(state, view, wanted) ? 0.4 : 1.2
    else state.spawnTimer = 0.6
  }
  return state
}

/**
 * Returns the hazard that just reached the craft, if any. The caller decides
 * what a detonation costs; this only reports it.
 */
export function detonateReachedHazard(state: HazardState, craftPosition: { x: number; y: number; z: number }) {
  for (const hazard of state.objects) {
    if (hazard.kind !== 'explosive') continue
    if (!hazard.active || hazard.detonated || hazard.absorbing) continue
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

/** Shot from range instead of swallowed - the laser's job. Trucks are not
 *  targets; there is nothing in one to set off. */
export function destroyHazard(state: HazardState, id: string) {
  for (const hazard of state.objects) {
    if (hazard.kind !== 'explosive') continue
    if (!hazard.active || hazard.id !== id) continue
    hazard.active = false
    hazard.inBeam = false
    hazard.tether = 0
    hazard.explosionPending = true
    return hazard
  }
  return null
}

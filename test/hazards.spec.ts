import { describe, expect, it } from 'vitest'
import { isAbsorbable } from '../src/core/beam'
import {
  HAZARD_MAX,
  HAZARD_TRIGGER_DISTANCE,
  activeHazardCount,
  createHazardState,
  destroyHazard,
  detonateReachedHazard,
  hazardTargetForTime,
  stepHazards,
} from '../src/core/hazards'

const view = (elapsed: number, x = 0, z = 0) => ({ position: { x, y: 6, z }, heading: 0, elapsed })

describe('ground explosives', () => {
  it('gates non-building objects by one-third of the current UFO diameter', () => {
    expect(isAbsorbable('explosive', 5.1, 1.8)).toBe(false)
    expect(isAbsorbable('explosive', 5.1, 5.1)).toBe(true)
    expect(isAbsorbable('car', 2.9, 3)).toBe(true)
    expect(isAbsorbable('pedestrian', 0.78, 1.8)).toBe(true)
    expect(isAbsorbable('cat', 0.55, 1.8)).toBe(true)
    expect(isAbsorbable('anti-air', 1, 20)).toBe(false)
  })

  it('stays out of the opening minute and then builds up', () => {
    expect(hazardTargetForTime(0)).toBe(0)
    expect(hazardTargetForTime(20)).toBe(0)
    expect(hazardTargetForTime(40)).toBeGreaterThan(0)
    expect(hazardTargetForTime(140)).toBeGreaterThan(hazardTargetForTime(60))
    expect(hazardTargetForTime(600)).toBeLessThanOrEqual(HAZARD_MAX)
  })

  it('populates up to the target as the run goes on', () => {
    const state = createHazardState(11)
    for (let frame = 0; frame < 60 * 60; frame += 1) stepHazards(state, view(90), 1 / 60)
    expect(activeHazardCount(state)).toBe(hazardTargetForTime(90))
  })

  it('raises the alarm while held and stands down when released', () => {
    const state = createHazardState(3)
    stepHazards(state, view(90), 1 / 60)
    for (let frame = 0; frame < 120; frame += 1) stepHazards(state, view(90), 1 / 60)
    const hazard = state.objects.find((item) => item.active)!
    hazard.inBeam = true
    for (let frame = 0; frame < 60; frame += 1) stepHazards(state, view(90), 1 / 60)
    const heldAlarm = hazard.alarm
    expect(heldAlarm).toBeGreaterThan(0.5)
    // Releasing has to visibly defuse it, or the escape hatch reads as useless.
    hazard.inBeam = false
    hazard.tether = 0
    for (let frame = 0; frame < 60; frame += 1) stepHazards(state, view(90), 1 / 60)
    expect(hazard.alarm).toBeLessThan(heldAlarm)
  })

  it('only detonates on a held hazard that reaches the craft', () => {
    const state = createHazardState(5)
    const hazard = state.objects[0]!
    hazard.active = true
    hazard.position = { x: 0, y: 6, z: 0 }
    const craft = { x: 0, y: 6, z: 0 }
    // Sitting on the ground under the craft is not enough; it has to be held.
    expect(detonateReachedHazard(state, craft)).toBeNull()
    hazard.inBeam = true
    expect(detonateReachedHazard(state, craft)?.id).toBe(hazard.id)
    expect(hazard.active).toBe(false)
    // And never twice.
    expect(detonateReachedHazard(state, craft)).toBeNull()
  })

  it('leaves a held hazard alone until it is drawn close', () => {
    const state = createHazardState(7)
    const hazard = state.objects[0]!
    hazard.active = true
    hazard.inBeam = true
    hazard.position = { x: 0, y: 6 - HAZARD_TRIGGER_DISTANCE - 1, z: 0 }
    expect(detonateReachedHazard(state, { x: 0, y: 6, z: 0 })).toBeNull()
    hazard.position.y = 6 - HAZARD_TRIGGER_DISTANCE + 0.2
    expect(detonateReachedHazard(state, { x: 0, y: 6, z: 0 })).not.toBeNull()
  })

  it('can be shot from range instead of swallowed', () => {
    const state = createHazardState(9)
    const hazard = state.objects[0]!
    hazard.active = true
    expect(destroyHazard(state, hazard.id)?.id).toBe(hazard.id)
    expect(hazard.active).toBe(false)
    expect(destroyHazard(state, hazard.id)).toBeNull()
  })
})

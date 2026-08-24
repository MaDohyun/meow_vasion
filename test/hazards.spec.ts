import { describe, expect, it } from 'vitest'
import { CAR_MASS, beamLiftScale, beginNearbyBeamObjectAbsorption, isAbsorbable } from '../src/core/beam'
import { SIZE_START, ufoDiameter } from '../src/core/size'
import {
  HAZARD_MAX,
  activeHazardCount,
  createHazardState,
  damageHazard,
  hazardTargetForTime,
  stepHazards,
  truckTargetForTime,
  HAZARD_HP,
  TRUCK_HP,
  TRUCK_MASS,
  HAZARD_MASS,
} from '../src/core/hazards'
import { trafficPositionIsDriveable } from '../src/core/traffic'

const view = (elapsed: number, x = 0, z = 0) => ({ position: { x, y: 6, z }, heading: 0, elapsed })

describe('ground explosives', () => {
  it('gates non-building objects by the current UFO diameter', () => {
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

  it('keeps tankers rarer than trucks at every point in the run', () => {
    // The tanker used to be the only heavy vehicle on the road, so a full beam
    // was more likely to be holding a bomb than a haul. Freight has to be the
    // common case or the weight mechanic reads as pure punishment.
    for (const elapsed of [0, 40, 90, 150, 240, 300]) {
      expect(hazardTargetForTime(elapsed)).toBeLessThan(truckTargetForTime(elapsed))
    }
    expect(hazardTargetForTime(300) + truckTargetForTime(300)).toBeLessThanOrEqual(HAZARD_MAX)
  })

  it('puts trucks on the road from the first second, tankers only later', () => {
    const state = createHazardState(23)
    for (let frame = 0; frame < 20 * 60; frame += 1) stepHazards(state, view(10), 1 / 60)
    expect(activeHazardCount(state, 'truck')).toBeGreaterThan(0)
    expect(activeHazardCount(state, 'explosive')).toBe(0)
    for (const hazard of state.objects.filter((item) => item.active)) {
      expect(trafficPositionIsDriveable(hazard.position, hazard.roadAxis)).toBe(true)
    }
  })

  it('moves only a portion of road-safe freight slots', () => {
    const state = createHazardState(41)
    for (let frame = 0; frame < 180; frame += 1) stepHazards(state, view(40), 1 / 60)
    const moving = state.objects.find((hazard) => hazard.active && hazard.speed > 0)
    const stopped = state.objects.find((hazard) => hazard.active && hazard.speed === 0)
    expect(moving).toBeDefined()
    expect(stopped).toBeDefined()
    const before = { ...moving!.position }
    stepHazards(state, view(40), 1 / 30)
    expect(Math.hypot(moving!.position.x - before.x, moving!.position.z - before.z)).toBeGreaterThan(0)
    expect(trafficPositionIsDriveable(moving!.position, moving!.roadAxis)).toBe(true)
    const expectedRotation = moving!.roadAxis === 'x'
      ? moving!.roadDirection > 0 ? -Math.PI / 2 : Math.PI / 2
      : moving!.roadDirection > 0 ? Math.PI : 0
    expect(moving!.rotation.y).toBeCloseTo(expectedRotation)
  })

  it('gives a truck weight worth feeling but nothing to set off on the beam', () => {
    // Between a car and a tanker: heavy enough that the ballast meter moves,
    // harmless enough that eating one is the reward rather than the trap.
    expect(TRUCK_MASS).toBeGreaterThan(CAR_MASS)
    expect(TRUCK_MASS).toBeLessThan(HAZARD_MASS)
    const state = createHazardState(29)
    for (let frame = 0; frame < 20 * 60; frame += 1) stepHazards(state, view(10), 1 / 60)
    const truck = state.objects.find((item) => item.active && item.kind === 'truck')!
    truck.inBeam = true
    for (let frame = 0; frame < 60; frame += 1) stepHazards(state, view(10), 1 / 60)
    expect(truck.active).toBe(true)
  })

  it('populates up to the target as the run goes on', () => {
    const state = createHazardState(11)
    for (let frame = 0; frame < 60 * 60; frame += 1) stepHazards(state, view(90), 1 / 60)
    expect(activeHazardCount(state, 'explosive')).toBe(hazardTargetForTime(90))
    expect(activeHazardCount(state, 'truck')).toBe(truckTargetForTime(90))
  })

  it('swallows a tanker drawn to the craft instead of detonating it', () => {
    // The tanker used to blow up the moment the beam drew it within 3.4m,
    // which made the most valuable thing on the road the one object that
    // punished the verb the whole run teaches. It is food now.
    const state = createHazardState(5)
    stepHazards(state, view(90), 1 / 60)
    for (let frame = 0; frame < 120; frame += 1) stepHazards(state, view(90), 1 / 60)
    const tanker = state.objects.find((item) => item.active && item.kind === 'explosive')!
    const craft = { x: tanker.position.x, y: tanker.position.y, z: tanker.position.z }
    tanker.inBeam = true

    // Held right up against the craft: nothing goes off, and it is still there
    // to be eaten.
    for (let frame = 0; frame < 60; frame += 1) stepHazards(state, view(90), 1 / 60)
    expect(tanker.active).toBe(true)
    expect(tanker.explosionPending).toBe(false)

    // A craft wide enough and strong enough swallows it through the ordinary
    // gates - no special case for the tanker in either direction.
    expect(beamLiftScale(HAZARD_MASS, 4)).toBeGreaterThan(0)
    const eaten = beginNearbyBeamObjectAbsorption(state.objects, craft, ufoDiameter(1.2), 3.48, 4)
    expect(eaten?.id).toBe(tanker.id)
    expect(tanker.absorbing).toBe(true)
    expect(tanker.explosionPending).toBe(false)
  })

  it('still refuses a tanker the craft is too small or too weak for', () => {
    const state = createHazardState(11)
    stepHazards(state, view(90), 1 / 60)
    for (let frame = 0; frame < 120; frame += 1) stepHazards(state, view(90), 1 / 60)
    const tanker = state.objects.find((item) => item.active && item.kind === 'explosive')!
    tanker.inBeam = true
    const craft = { x: tanker.position.x, y: tanker.position.y, z: tanker.position.z }
    // Strong enough, too narrow (hull 2.48m against a 5.1m tanker).
    expect(beginNearbyBeamObjectAbsorption([tanker], craft, ufoDiameter(SIZE_START), 3.48, 7)).toBeNull()
    // Wide enough, too weak.
    expect(beginNearbyBeamObjectAbsorption([tanker], craft, ufoDiameter(1.2), 3.48, 1)).toBeNull()
    expect(tanker.active).toBe(true)
    expect(tanker.explosionPending).toBe(false)
  })

  it('takes three laser hits to blow a tanker and two for a truck', () => {
    expect(HAZARD_HP).toBe(3)
    expect(TRUCK_HP).toBe(2)
    const state = createHazardState(9)
    const tanker = state.objects[0]!
    tanker.active = true
    // Every hit short of the last reports back so the caller can land a blast
    // effect on the bodywork; only the final one takes the vehicle out.
    expect(damageHazard(state, tanker.id)).toEqual({ hazard: tanker, destroyed: false })
    expect(damageHazard(state, tanker.id)).toEqual({ hazard: tanker, destroyed: false })
    expect(tanker.active).toBe(true)
    expect(damageHazard(state, tanker.id)).toEqual({ hazard: tanker, destroyed: true })
    expect(tanker.active).toBe(false)
    expect(tanker.explosionPending).toBe(true)
    // Once it is gone it stops being a target.
    expect(damageHazard(state, tanker.id)).toBeNull()

    const truck = state.objects[1]!
    truck.active = true
    truck.kind = 'truck'
    truck.hp = TRUCK_HP
    expect(damageHazard(state, truck.id)).toEqual({ hazard: truck, destroyed: false })
    expect(damageHazard(state, truck.id)).toEqual({ hazard: truck, destroyed: true })
    expect(truck.active).toBe(false)
  })

  it('drops a stronger laser through the hit points faster', () => {
    const state = createHazardState(13)
    const tanker = state.objects[0]!
    tanker.active = true
    // A levelled-up laser (x1.4 damage) still needs a believable burst, not one
    // shot: 3 hp / 1.4 = 3 hits, 3 hp / 1.6 = 2 hits.
    expect(damageHazard(state, tanker.id, 1.6)).toEqual({ hazard: tanker, destroyed: false })
    expect(damageHazard(state, tanker.id, 1.6)).toEqual({ hazard: tanker, destroyed: true })
  })
})

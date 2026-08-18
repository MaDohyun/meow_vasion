import { describe, expect, it } from 'vitest'
import { channelTarget, generateMission, isMissionComplete, nearestBeamTarget } from '../src/core/missions'

describe('ufo mission loop', () => {
  it('starts with two cows and completes after both are channeled', () => {
    const mission = generateMission(0)
    expect(mission.kind).toBe('abduct')
    expect(mission.targets).toHaveLength(2)

    for (const target of mission.targets) channelTarget(mission, target.id, 2)

    expect(mission.completed).toBe(2)
    expect(isMissionComplete(mission)).toBe(true)
  })

  it('only locks targets beneath the low-altitude beam', () => {
    const mission = generateMission(0)
    const cow = mission.targets[0]!

    expect(nearestBeamTarget(mission, { x: cow.position.x, y: 4, z: cow.position.z })?.id).toBe(cow.id)
    expect(nearestBeamTarget(mission, { x: cow.position.x, y: 14, z: cow.position.z })).toBeNull()
    expect(nearestBeamTarget(mission, { x: cow.position.x + 20, y: 4, z: cow.position.z })).toBeNull()
  })

  it('cycles deterministic mission types', () => {
    expect(generateMission(1).kind).toBe('scan')
    expect(generateMission(3).kind).toBe('smash')
    expect(generateMission(6).title).toBe(generateMission(0).title)
  })
})

import { describe, expect, it } from 'vitest'
import {
  AIRSHOW_ALTITUDE,
  AIRSHOW_HOLD_TIME,
  channelTarget,
  completeEnemyMission,
  isMissionComplete,
  nearestBeamTarget,
  selectMission,
  stepAirshowMission,
  type MissionCandidate,
} from '../src/core/missions'

const origin = { x: 0, z: 0 }
const candidates: MissionCandidate[] = [
  { id: 'cat:1', kind: 'cat', position: { x: 8, y: 0.65, z: 4 } },
  { id: 'person:1', kind: 'pedestrian', position: { x: 12, y: 0.65, z: 2 } },
  { id: 'car:1', kind: 'car', position: { x: 14, y: 0.65, z: 0 } },
  { id: 'enemy:1', kind: 'enemy', position: { x: 18, y: 5, z: 0 } },
]

describe('single-target live-world mission loop', () => {
  it('always creates one mission with exactly one nearby real target', () => {
    const mission = selectMission(0, origin, candidates, 0)!
    expect(mission.kind).toBe('cat-abduct')
    expect(mission.targets).toHaveLength(1)
    expect(mission.targets[0]?.id).toBe('cat:1')
    channelTarget(mission, 'cat:1', 2)
    expect(isMissionComplete(mission)).toBe(true)
  })

  it('does not offer missing, distant, or unavailable enemy targets', () => {
    const onlyFarEnemy: MissionCandidate[] = [
      { id: 'enemy:far', kind: 'enemy', position: { x: 200, y: 3, z: 0 } },
      { id: 'car:near', kind: 'car', position: { x: 20, y: 0.65, z: 0 } },
    ]
    expect(selectMission(3, origin, onlyFarEnemy, 0)?.kind).toBe('car-airshow')
    expect(selectMission(3, origin, onlyFarEnemy, 4)?.kind).toBe('car-airshow')
    expect(selectMission(0, origin, [], 5)).toBeNull()
  })

  it('completes the airshow only after a car is held above altitude', () => {
    const mission = selectMission(2, origin, candidates, 2)!
    expect(mission.kind).toBe('car-airshow')
    expect(stepAirshowMission(mission, { position: { x: 0, y: AIRSHOW_ALTITUDE - 1, z: 0 }, inBeam: true }, 10)).toBe(false)
    expect(mission.targets[0]?.progress).toBe(0)
    expect(stepAirshowMission(mission, { position: { x: 0, y: AIRSHOW_ALTITUDE + 1, z: 0 }, inBeam: true }, AIRSHOW_HOLD_TIME)).toBe(true)
    expect(isMissionComplete(mission)).toBe(true)
  })

  it('only beam-locks abduct/airshow targets and completes the marked enemy', () => {
    const catMission = selectMission(0, origin, candidates, 1)!
    const cat = catMission.targets[0]!
    expect(nearestBeamTarget(catMission, { x: cat.position.x, y: 4, z: cat.position.z })?.id).toBe(cat.id)

    const enemyMission = selectMission(3, origin, candidates, 1)!
    expect(enemyMission.kind).toBe('enemy-takedown')
    expect(nearestBeamTarget(enemyMission, { x: 18, y: 8, z: 0 })).toBeNull()
    expect(completeEnemyMission(enemyMission, 'enemy:wrong')).toBe(false)
    expect(completeEnemyMission(enemyMission, 'enemy:1')).toBe(true)
  })

  it('contains no placeholder mystery-circle mission', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(selectMission(index, origin, candidates, 5)?.kind).not.toContain('circle')
    }
  })
})

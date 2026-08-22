import { describe, expect, it } from 'vitest'
import {
  MISSION_ONE_POOL,
  MISSION_THREE_QUESTS,
  MISSION_TWO_POOL,
  createMissionState,
  recordMissionEvent,
  startMissionOne,
  syncMissionState,
  type MissionQuest,
  type MissionQuestId,
} from '../src/core/missions'

function completeEvent(id: MissionQuestId, target: number) {
  if (id === 'capture-cats') return { type: 'capture-cat', amount: target } as const
  if (id === 'capture-people') return { type: 'capture-person', amount: target } as const
  if (id === 'destroy-cars') return { type: 'destroy-car', amount: target } as const
  if (id === 'destroy-trucks') return { type: 'destroy-truck', amount: target } as const
  if (id === 'absorb-water') return { type: 'absorb-water', litres: target } as const
  if (id === 'ruin-buildings') return { type: 'ruin-building', amount: target } as const
  if (id === 'destroy-gas-station') return { type: 'destroy-gas-station', amount: target } as const
  if (id === 'destroy-comms') return { type: 'destroy-comms', amount: target } as const
  if (id === 'destroy-drones') return { type: 'destroy-enemy', kind: 'drone', amount: target } as const
  if (id === 'destroy-fighters') return { type: 'destroy-enemy', kind: 'fighter', amount: target } as const
  if (id === 'air-checkpoints') return { type: 'pass-checkpoint', amount: target } as const
  throw new Error(`No stage-one/two event for ${id}`)
}

function completeQuest(state: ReturnType<typeof createMissionState>, quest: MissionQuest, elapsed: number) {
  if (quest.id === 'pass-mystery-circles') {
    for (let index = 0; index < quest.target; index += 1) {
      recordMissionEvent(state, { type: 'pass-mystery-circle', id: `test-circle:${state.stage}:${index}` }, elapsed)
    }
    return
  }
  recordMissionEvent(state, completeEvent(quest.id, quest.target), elapsed)
}

describe('three-stage reconnaissance missions', () => {
  it('waits for the tutorial cat before assigning three distinct quests', () => {
    const state = createMissionState(17)
    expect(state.stage).toBe(0)
    expect(state.quests).toEqual([])
    startMissionOne(state, 0)
    expect(state.stage).toBe(1)
    expect(state.quests).toHaveLength(3)
    expect(new Set(state.quests.map((quest) => quest.id)).size).toBe(3)
    for (const quest of state.quests) expect(MISSION_ONE_POOL).toContain(quest.id)
  })

  it('runs all three quests in parallel and gates the next mission on all three', () => {
    const state = createMissionState(23)
    startMissionOne(state, 0)
    const [first, second, third] = [...state.quests]
    completeQuest(state, second!, 20)
    expect(state.stage).toBe(1)
    expect(second!.complete).toBe(true)
    completeQuest(state, first!, 30)
    expect(state.stage).toBe(1)
    completeQuest(state, third!, 40)
    expect(state.stage).toBe(2)
    expect(state.quests).toHaveLength(3)
    expect(new Set(state.quests.map((quest) => quest.id)).size).toBe(3)
    for (const quest of state.quests) expect(MISSION_TWO_POOL).toContain(quest.id)
    expect(state.quests.filter((quest) => quest.id === 'destroy-gas-station' || quest.id === 'destroy-comms').length).toBeLessThanOrEqual(1)
  })

  it('uses the fixed final trio and wins only when the clock and other goals are done', () => {
    const state = createMissionState(31)
    startMissionOne(state, 0)
    for (const quest of [...state.quests]) completeQuest(state, quest, 60)
    for (const quest of [...state.quests]) completeQuest(state, quest, 150)
    expect(state.stage).toBe(3)
    expect(state.quests.map((quest) => quest.id)).toEqual(MISSION_THREE_QUESTS)
    recordMissionEvent(state, { type: 'destroy-enemy', kind: 'boss' }, 220)
    expect(syncMissionState(state, 299, 99999)).toBe(false)
    expect(state.stage).toBe(3)
    expect(syncMissionState(state, 300, 99999)).toBe(true)
    expect(state.stage).toBe(4)
  })

  it('counts only different circles and uses the stage-specific target', () => {
    const state = createMissionState(41)
    startMissionOne(state, 0)
    const first = state.quests.find((quest) => quest.id === 'pass-mystery-circles')!
    expect(first.target).toBe(3)
    recordMissionEvent(state, { type: 'pass-mystery-circle', id: 'circle:a' }, 3)
    recordMissionEvent(state, { type: 'pass-mystery-circle', id: 'circle:a' }, 6)
    expect(first.progress).toBe(1)
    recordMissionEvent(state, { type: 'pass-mystery-circle', id: 'circle:b' }, 9)
    recordMissionEvent(state, { type: 'pass-mystery-circle', id: 'circle:c' }, 12)
    expect(first.progress).toBe(3)

    // Complete the other two stage-one quests to open mission two.
    for (const quest of [...state.quests]) if (!quest.complete) completeQuest(state, quest, 20)
    const second = state.quests.find((quest) => quest.id === 'pass-mystery-circles')!
    expect(second.target).toBe(5)
  })

  it('randomizes the quest order in missions one and two', () => {
    const firstStageSlots = new Set<MissionQuestId>()
    const secondStageSlots = new Set<MissionQuestId>()

    for (let seed = 1; seed <= 12; seed += 1) {
      const state = createMissionState(seed)
      startMissionOne(state, 0)
      expect(state.quests.some((quest) => quest.id === 'pass-mystery-circles')).toBe(true)
      firstStageSlots.add(state.quests[0]!.id)

      for (const quest of [...state.quests]) completeQuest(state, quest, 20)
      expect(state.stage).toBe(2)
      expect(state.quests.some((quest) => quest.id === 'pass-mystery-circles')).toBe(true)
      secondStageSlots.add(state.quests[0]!.id)
    }

    expect(firstStageSlots.size).toBeGreaterThan(1)
    expect(secondStageSlots.size).toBeGreaterThan(1)
  })
})

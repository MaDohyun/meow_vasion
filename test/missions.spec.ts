import { describe, expect, it } from 'vitest'
import {
  MISSION_ONE_POOL,
  MISSION_RUN_SECONDS,
  MISSION_THREE_QUESTS,
  MISSION_TWO_POOL,
  createMissionState,
  isInsideAirCheckpoint,
  recordMissionEvent,
  startFinalMission,
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
  if (id === 'destroy-tankers') return { type: 'destroy-tanker', amount: target } as const
  if (id === 'absorb-water') return { type: 'absorb-water', litres: target } as const
  if (id === 'ruin-buildings') return { type: 'ruin-building', amount: target } as const
  if (id === 'destroy-comms') return { type: 'destroy-comms', amount: target } as const
  if (id === 'destroy-drones') return { type: 'destroy-enemy', kind: 'drone', amount: target } as const
  if (id === 'destroy-fighters') return { type: 'destroy-enemy', kind: 'fighter', amount: target } as const
  if (id === 'absorb-rooftop-structures') return { type: 'absorb-rooftop-structure', amount: target } as const
  if (id === 'absorb-trees') return { type: 'absorb-tree', amount: target } as const
  if (id === 'absorb-streetlights') return { type: 'absorb-streetlight', amount: target } as const
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
  it('drops the developer drill straight into the final assignment', () => {
    // The drill opens on the dreadnought, so it needs the stage that actually
    // asks for the dreadnought - a boss fight with the objective two stages
    // away would be testing a different fight from the one players get.
    const state = createMissionState(5)
    startFinalMission(state, 180)
    expect(state.stage).toBe(3)
    expect(state.stageStartedAt).toBe(180)
    expect(state.quests.map((quest) => quest.id)).toEqual([...MISSION_THREE_QUESTS])
    // The survival objective is what is left of the run, not the whole of it.
    const survival = state.quests.find((quest) => quest.id === 'survive-final')!
    expect(survival.target).toBe(MISSION_RUN_SECONDS - 180)
    // And killing the ship still counts, exactly as it would in a real run.
    recordMissionEvent(state, { type: 'destroy-enemy', kind: 'boss', amount: 1 }, 190)
    expect(state.quests.find((quest) => quest.id === 'destroy-battleship')!.complete).toBe(true)
  })

  it('counts an air checkpoint as soon as the craft passes through its ring', () => {
    const checkpoint = { x: 10, y: 20, z: 30 }
    expect(isInsideAirCheckpoint({ x: 10, y: 20, z: 34.99 }, checkpoint)).toBe(true)
    expect(isInsideAirCheckpoint({ x: 10, y: 20, z: 35.01 }, checkpoint)).toBe(false)
  })

  it('completes the mission-two checkpoint objective after three fly-throughs', () => {
    let selectedState: ReturnType<typeof createMissionState> | null = null
    for (let seed = 1; seed <= 100 && !selectedState; seed += 1) {
      const state = createMissionState(seed)
      startMissionOne(state, 0)
      for (const quest of [...state.quests]) completeQuest(state, quest, 20)
      if (state.quests.some((quest) => quest.id === 'air-checkpoints')) selectedState = state
    }

    const quest = selectedState!.quests.find((candidate) => candidate.id === 'air-checkpoints')!
    expect(quest.target).toBe(3)
    for (let pass = 1; pass <= 3; pass += 1) {
      recordMissionEvent(selectedState!, { type: 'pass-checkpoint' }, 20 + pass)
      expect(quest.progress).toBe(pass)
    }
    expect(quest.complete).toBe(true)
  })

  it('waits for the tutorial cat before assigning three distinct quests', () => {
    const state = createMissionState(17)
    expect(state.stage).toBe(0)
    expect(state.quests).toEqual([])
    startMissionOne(state, 0)
    expect(state.stage).toBe(1)
    expect(state.quests).toHaveLength(3)
    expect(new Set(state.quests.map((quest) => quest.id)).size).toBe(3)
    for (const quest of state.quests) expect(MISSION_ONE_POOL).toContain(quest.id)
    expect(state.quests.filter((quest) => quest.id === 'pass-mystery-circles')).toHaveLength(1)
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
    expect(state.quests.some((quest) => quest.id === 'pass-mystery-circles')).toBe(false)
    expect(MISSION_TWO_POOL).not.toContain('destroy-gas-station')
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

  it('counts only different circles in mission one and removes the objective from mission two', () => {
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
    expect(state.stage).toBe(2)
    expect(state.quests.some((quest) => quest.id === 'pass-mystery-circles')).toBe(false)
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
      expect(state.quests.some((quest) => quest.id === 'pass-mystery-circles')).toBe(false)
      secondStageSlots.add(state.quests[0]!.id)
    }

    expect(firstStageSlots.size).toBeGreaterThan(1)
    expect(secondStageSlots.size).toBeGreaterThan(1)
  })

  it('asks for ten human samples and offers the tanker hunt in mission one', () => {
    expect(MISSION_ONE_POOL).toContain('destroy-tankers')
    let peopleState: ReturnType<typeof createMissionState> | null = null
    let tankerState: ReturnType<typeof createMissionState> | null = null
    for (let seed = 1; seed <= 200 && (!peopleState || !tankerState); seed += 1) {
      const state = createMissionState(seed)
      startMissionOne(state, 0)
      if (!peopleState && state.quests.some((quest) => quest.id === 'capture-people')) peopleState = state
      if (!tankerState && state.quests.some((quest) => quest.id === 'destroy-tankers')) tankerState = state
    }
    expect(peopleState!.quests.find((quest) => quest.id === 'capture-people')!.target).toBe(10)
    const tankers = tankerState!.quests.find((quest) => quest.id === 'destroy-tankers')!
    expect(tankers.target).toBe(3)
    recordMissionEvent(tankerState!, { type: 'destroy-tanker' }, 30)
    expect(tankers.progress).toBe(1)
    recordMissionEvent(tankerState!, { type: 'destroy-tanker', amount: 2 }, 40)
    expect(tankers.complete).toBe(true)
  })

  it('offers tree and streetlight absorption in mission two instead of the gas station', () => {
    expect(MISSION_TWO_POOL).toContain('absorb-trees')
    expect(MISSION_TWO_POOL).toContain('absorb-streetlights')
    let selectedState: ReturnType<typeof createMissionState> | null = null
    for (let seed = 1; seed <= 200 && !selectedState; seed += 1) {
      const state = createMissionState(seed)
      startMissionOne(state, 0)
      for (const quest of [...state.quests]) completeQuest(state, quest, 20)
      if (
        state.quests.some((quest) => quest.id === 'absorb-trees')
        && state.quests.some((quest) => quest.id === 'absorb-streetlights')
      ) selectedState = state
    }
    expect(selectedState).not.toBeNull()
    const trees = selectedState!.quests.find((quest) => quest.id === 'absorb-trees')!
    const lights = selectedState!.quests.find((quest) => quest.id === 'absorb-streetlights')!
    expect(trees.target).toBe(5)
    expect(lights.target).toBe(4)
    recordMissionEvent(selectedState!, { type: 'absorb-tree', amount: 5 }, 30)
    expect(trees.complete).toBe(true)
    recordMissionEvent(selectedState!, { type: 'absorb-streetlight', amount: 4 }, 31)
    expect(lights.complete).toBe(true)
  })

  it('offers and tracks absorption of five rooftop structures in mission two', () => {
    let selectedState: ReturnType<typeof createMissionState> | null = null
    for (let seed = 1; seed <= 100 && !selectedState; seed += 1) {
      const state = createMissionState(seed)
      startMissionOne(state, 0)
      for (const quest of [...state.quests]) completeQuest(state, quest, 20)
      if (state.quests.some((quest) => quest.id === 'absorb-rooftop-structures')) selectedState = state
    }

    expect(MISSION_TWO_POOL).toContain('absorb-rooftop-structures')
    expect(selectedState).not.toBeNull()
    const quest = selectedState!.quests.find((candidate) => candidate.id === 'absorb-rooftop-structures')!
    expect(quest.target).toBe(5)
    recordMissionEvent(selectedState!, { type: 'absorb-rooftop-structure', amount: 4 }, 30)
    expect(quest.progress).toBe(4)
    expect(quest.complete).toBe(false)
    recordMissionEvent(selectedState!, { type: 'absorb-rooftop-structure' }, 31)
    expect(quest.progress).toBe(5)
    expect(quest.complete).toBe(true)
  })
})

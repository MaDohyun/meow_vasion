import { describe, expect, it } from 'vitest'
import {
  MISSION_COUNT,
  MISSION_DEBRIEF_IDS,
  MISSION_ORDER,
  MISSION_RUN_SECONDS,
  MISSION_TARGETS,
  closeRecon,
  createMissionState,
  isReconComplete,
  missionAdvisoryGiven,
  missionHasQuest,
  peekMissionDebrief,
  queueMissionAdvisory,
  recordMissionEvent,
  startFinalMission,
  startMissionOne,
  syncMissionState,
  takeMissionDebrief,
  type MissionState,
} from '../src/core/missions'

/** Fills the active gauge to the brim in one event. */
function clear(state: MissionState, elapsed: number) {
  const quest = state.quest!
  if (quest.id === 'visit-mystery-circle') {
    recordMissionEvent(state, { type: 'pass-mystery-circle', id: `circle:${elapsed}` }, elapsed)
    return
  }
  if (quest.id === 'absorb-water') {
    recordMissionEvent(state, { type: 'absorb-water', litres: quest.target }, elapsed)
    return
  }
  if (quest.id === 'absorb-samples') {
    recordMissionEvent(state, { type: 'absorb-score', score: quest.target }, elapsed)
    return
  }
  if (quest.id === 'wreck-city') {
    recordMissionEvent(state, { type: 'destroy-score', score: quest.target }, elapsed)
    return
  }
  closeRecon(state, MISSION_RUN_SECONDS)
}

/** A run that has reached the given rung with nothing banked past it. */
function atStage(stage: number, elapsed = 10) {
  const state = createMissionState()
  startMissionOne(state, 0)
  while (state.stage < stage) {
    clear(state, elapsed)
    takeMissionDebrief(state)
  }
  return state
}

describe('the five-mission ladder', () => {
  it('waits for the tutorial cat before opening the first rung', () => {
    const state = createMissionState()
    expect(state.stage).toBe(0)
    expect(state.quest).toBeNull()
    // Nothing banks during the tutorial: there is no board to bank into.
    expect(recordMissionEvent(state, { type: 'absorb-score', score: 999 }, 0)).toBe(false)
    startMissionOne(state, 0)
    expect(state.stage).toBe(1)
    expect(state.quest?.id).toBe('visit-mystery-circle')
    expect(state.quest?.progress).toBe(0)
  })

  it('runs the same five rungs in the same order every time', () => {
    expect(MISSION_ORDER).toHaveLength(MISSION_COUNT)
    const state = createMissionState()
    startMissionOne(state, 0)
    const seen = [state.quest!.id]
    for (let step = 1; step < MISSION_COUNT; step += 1) {
      clear(state, 10 * step)
      takeMissionDebrief(state)
      seen.push(state.quest!.id)
    }
    expect(seen).toEqual([...MISSION_ORDER])
  })

  it('shows one objective at a time and never a stale one', () => {
    const state = atStage(3)
    expect(state.quest?.id).toBe('absorb-samples')
    expect(missionHasQuest(state, 'absorb-samples')).toBe(true)
    expect(missionHasQuest(state, 'visit-mystery-circle')).toBe(false)
    expect(missionHasQuest(state, 'wreck-city')).toBe(false)
  })

  it('counts one circle per id, however many laps are flown of it', () => {
    const state = createMissionState()
    startMissionOne(state, 0)
    expect(MISSION_TARGETS['visit-mystery-circle']).toBe(1)
    expect(recordMissionEvent(state, { type: 'pass-mystery-circle', id: 'circle:a' }, 4)).toBe(true)
    expect(state.stage).toBe(2)
    // A second lap of the same circle is not a second circle.
    expect(recordMissionEvent(state, { type: 'pass-mystery-circle', id: 'circle:a' }, 6)).toBe(false)
  })

  it('keeps the sample and wrecking gauges on separate verbs', () => {
    const samples = atStage(3)
    recordMissionEvent(samples, { type: 'destroy-score', score: 5000 }, 30)
    // Blowing the city up does not collect a single sample.
    expect(samples.quest!.progress).toBe(0)
    recordMissionEvent(samples, { type: 'absorb-score', score: 120 }, 31)
    expect(samples.quest!.progress).toBe(120)

    const wrecking = atStage(4)
    recordMissionEvent(wrecking, { type: 'absorb-score', score: 5000 }, 40)
    expect(wrecking.quest!.progress).toBe(0)
    recordMissionEvent(wrecking, { type: 'destroy-score', score: 90 }, 41)
    expect(wrecking.quest!.progress).toBe(90)
  })

  it('credits what the pilot already did rather than restarting the meter', () => {
    const state = createMissionState()
    startMissionOne(state, 0)
    // Eating the city through missions one and two still counts toward three.
    recordMissionEvent(state, { type: 'absorb-score', score: 1500 }, 5)
    clear(state, 6)
    takeMissionDebrief(state)
    clear(state, 7)
    takeMissionDebrief(state)
    expect(state.stage).toBe(3)
    expect(state.quest!.progress).toBe(1500)
  })

  it('opens and closes a rung on the same frame when the totals are already past it', () => {
    const state = createMissionState()
    startMissionOne(state, 0)
    recordMissionEvent(state, { type: 'absorb-score', score: MISSION_TARGETS['absorb-samples'] }, 5)
    recordMissionEvent(state, { type: 'destroy-score', score: MISSION_TARGETS['wreck-city'] }, 5)
    recordMissionEvent(state, { type: 'absorb-water', litres: MISSION_TARGETS['absorb-water'] }, 5)
    // One circle now clears missions one through four in a single step.
    recordMissionEvent(state, { type: 'pass-mystery-circle', id: 'circle:a' }, 5)
    expect(state.stage).toBe(MISSION_COUNT)
    expect(state.quest?.id).toBe('final-sweep')
    // And no debrief is lost on the way through.
    expect(state.debriefs).toEqual([...MISSION_DEBRIEF_IDS])
  })

  it('does not close the recon a hair early when the two clocks disagree', () => {
    // sessionTime is counted up while remainingTime is counted down, so the
    // frame the run ends on can land a float epsilon short of the full window.
    const state = atStage(MISSION_COUNT, 60)
    expect(closeRecon(state, MISSION_RUN_SECONDS - 1e-9)).toBe(true)
  })

  it('sizes the last rung to whatever is left on the clock', () => {
    const state = atStage(MISSION_COUNT, 60)
    expect(state.quest!.id).toBe('final-sweep')
    expect(state.quest!.target).toBe(MISSION_RUN_SECONDS - 60)
    expect(syncMissionState(state, 200)).toBe(false)
    expect(state.quest!.progress).toBe(140)
    // The gauge reads full a frame before the runtime says the clock is out,
    // and reading full is not the same as being finished.
    expect(syncMissionState(state, MISSION_RUN_SECONDS)).toBe(false)
    expect(closeRecon(state, MISSION_RUN_SECONDS)).toBe(true)
    expect(isReconComplete(state)).toBe(true)
    expect(state.stage).toBe(MISSION_COUNT + 1)
  })

  it('fails the recon when the clock runs out on any earlier rung', () => {
    const state = atStage(4)
    expect(closeRecon(state, MISSION_RUN_SECONDS)).toBe(false)
    expect(isReconComplete(state)).toBe(false)
    expect(state.stage).toBe(4)
  })

  it('queues a debrief for the first four rungs and none for the last', () => {
    expect(MISSION_DEBRIEF_IDS).toEqual(MISSION_ORDER.slice(0, MISSION_COUNT - 1))
    const state = createMissionState()
    startMissionOne(state, 0)
    clear(state, 10)
    expect(peekMissionDebrief(state)).toBe('visit-mystery-circle')
    expect(takeMissionDebrief(state)).toBe('visit-mystery-circle')
    expect(peekMissionDebrief(state)).toBeNull()

    const last = atStage(MISSION_COUNT, 60)
    closeRecon(last, MISSION_RUN_SECONDS)
    // Finishing the run is the results screen's to report, not the general's
    // to freeze the game over.
    expect(peekMissionDebrief(last)).toBeNull()
  })

  it('gives the drone-mine warning once, and only inside a live run', () => {
    const state = createMissionState()
    // Stage 0 is the opening tutorial: the general is already talking and the
    // sky is empty, so there is nothing to warn about yet.
    expect(queueMissionAdvisory(state, 'drone-mine')).toBe(false)
    expect(peekMissionDebrief(state)).toBeNull()

    startMissionOne(state, 0)
    const boardBefore = state.revision
    expect(queueMissionAdvisory(state, 'drone-mine')).toBe(true)
    expect(missionAdvisoryGiven(state, 'drone-mine')).toBe(true)
    expect(peekMissionDebrief(state)).toBe('drone-mine')
    // A warning is not a change to the board, so the mission panel does not
    // pulse over it.
    expect(state.revision).toBe(boardBefore)

    // Once each. Meeting the next mine does not stop the game again.
    expect(queueMissionAdvisory(state, 'drone-mine')).toBe(false)
    expect(takeMissionDebrief(state)).toBe('drone-mine')
    expect(peekMissionDebrief(state)).toBeNull()
    expect(queueMissionAdvisory(state, 'drone-mine')).toBe(false)

    // And nothing is raised once the recon has closed.
    const closed = atStage(MISSION_COUNT, 60)
    closeRecon(closed, MISSION_RUN_SECONDS)
    expect(isReconComplete(closed)).toBe(true)
    expect(queueMissionAdvisory(closed, 'drone-mine')).toBe(false)
  })

  it('keeps a warning in the queue behind the debrief it landed with', () => {
    // Both go through the same queue, so a mine spotted on the frame a rung
    // cleared cannot overwrite the general's word about the rung.
    const state = createMissionState()
    startMissionOne(state, 0)
    clear(state, 10)
    queueMissionAdvisory(state, 'drone-mine')
    expect(takeMissionDebrief(state)).toBe('visit-mystery-circle')
    expect(takeMissionDebrief(state)).toBe('drone-mine')
  })

  it('drops the developer drill straight onto the last rung', () => {
    // The drill opens on the dreadnought late in a run, so it needs the board
    // a late run actually carries - and it steps over the four debriefs on the
    // way, because the drill is there to look at the fight rather than to be
    // talked through four lessons first.
    const state = createMissionState()
    startFinalMission(state, 180)
    expect(state.stage).toBe(MISSION_COUNT)
    expect(state.stageStartedAt).toBe(180)
    expect(state.quest!.id).toBe('final-sweep')
    expect(state.quest!.target).toBe(MISSION_RUN_SECONDS - 180)
    expect(state.debriefs).toEqual([])
    // And the clock still closes it exactly as it would in a real run.
    expect(closeRecon(state, MISSION_RUN_SECONDS)).toBe(true)
  })

  it('banks nothing once the recon has closed', () => {
    const state = atStage(MISSION_COUNT, 60)
    closeRecon(state, MISSION_RUN_SECONDS)
    const banked = state.totals.absorbScore
    expect(recordMissionEvent(state, { type: 'absorb-score', score: 500 }, 305)).toBe(false)
    expect(state.totals.absorbScore).toBe(banked)
  })
})

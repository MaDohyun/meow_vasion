/**
 * The five-mission reconnaissance assignment.
 *
 * The board used to be three stages of three randomly drawn errands, scored
 * in parallel. That shape had two problems the general could never talk
 * around: nine objectives is a list to audit rather than an order to follow,
 * and a random draw cannot teach anything, because the briefing does not know
 * what it drew.
 *
 * So the run is one fixed ladder now, five rungs long, one objective at a
 * time. Each rung is a thing the pilot has not been made to do yet - fly
 * through a circle, hold the beam on water, feed, burn, survive - and the
 * four that can be finished early end with the general explaining what the
 * pilot just discovered. The mission is the tutorial's second half.
 *
 * Two rules hold the whole thing together:
 *
 * - **The gauges are run totals, not stage totals.** A pilot who has been
 *   eating the city since the first minute does not get told to start over
 *   when the "absorb samples" rung comes up; the meter is already part full,
 *   which reads as credit for what they were already doing. It also means a
 *   rung can open already finished, so advancement loops rather than steps.
 * - **Only the beam feeds the sample meter, and only destruction feeds the
 *   wrecking meter.** Shooting a pedestrian is not a sample and swallowing a
 *   car is not an air raid; the two meters ask for two different verbs, which
 *   is the only reason having both is interesting.
 *
 * This module deliberately knows nothing about React or Three.js. The runtime
 * reports what happened, and this state machine owns the ladder, the gauges,
 * the debrief queue and the only victory condition.
 */

export const MISSION_RUN_SECONDS = 300
/** Rungs on the ladder. Stage 0 is the tutorial, stage 6 is "recon done". */
export const MISSION_COUNT = 5

export type MissionQuestId =
  | 'visit-mystery-circle'
  | 'absorb-water'
  | 'absorb-samples'
  | 'wreck-city'
  | 'final-sweep'

/** The order is the design: discover, learn a cost, feed, burn, hold on. */
export const MISSION_ORDER: readonly MissionQuestId[] = [
  'visit-mystery-circle',
  'absorb-water',
  'absorb-samples',
  'wreck-city',
  'final-sweep',
]

export type MissionDebriefId = Exclude<MissionQuestId, 'final-sweep'>

/**
 * The four missions the general debriefs.
 *
 * The last one is not on the list because finishing it *is* the end of the
 * run - the results screen has the general's closing word instead, and
 * freezing the game to talk over a clock that has already stopped would be
 * two endings in a row.
 *
 * Written out rather than sliced off MISSION_ORDER so the element type is
 * checked here instead of asserted; the test holds it to the same four.
 */
export const MISSION_DEBRIEF_IDS: readonly MissionDebriefId[] = [
  'visit-mystery-circle',
  'absorb-water',
  'absorb-samples',
  'wreck-city',
]

export const MISSION_TARGETS: Record<MissionQuestId, number> = {
  // One circle. The point of the rung is that the pilot goes to look at one,
  // not that they farm them; the general's debrief does the rest of the work.
  'visit-mystery-circle': 1,
  // Four seconds of held beam over open water at 50 L/s. It was eight, and
  // that was twice as long as the rung needs: the lesson is the drag, and the
  // drag is felt in the first second. The rest was the pilot sitting still in
  // the one place the craft cannot run from, waiting for a meter.
  'absorb-water': 200,
  // Sized so a pilot who clears it is visibly a different craft than the one
  // that started. Absorption pays out with the size multiplier and size
  // compounds as it feeds, so the meter accelerates: about a hundred seconds
  // of steady eating, ending several times wider than the opening saucer.
  // The four gauges all run from the first second of the flight, so the run
  // is priced against the longest of them rather than against their sum.
  'absorb-samples': 3000,
  // Four to seven towers, or a mixed diet of blocks, traffic and aircraft.
  'wreck-city': 1800,
  // Replaced at stage start with whatever is left on the clock.
  'final-sweep': 0,
}

export type MissionQuest = {
  id: MissionQuestId
  progress: number
  target: number
  complete: boolean
}

/**
 * Run totals, banked for the whole flight rather than per stage.
 *
 * Circles are kept by id because flying a lap of the same one is one circle
 * visited, not two.
 */
export type MissionTotals = {
  circles: string[]
  water: number
  absorbScore: number
  destroyScore: number
}

export type MissionState = {
  /** 0 is the cat tutorial, 1..5 are the missions, 6 is recon complete. */
  stage: number
  quest: MissionQuest | null
  stageStartedAt: number
  totals: MissionTotals
  /** Missions finished and still owing the pilot a word from the general.
   *  A queue rather than a slot: a rung can open already full and close on
   *  the same frame, and neither debrief should be lost. */
  debriefs: MissionDebriefId[]
  /** Bumped whenever the board changes shape, so the HUD can pulse without
   *  diffing quests. */
  revision: number
}

export type MissionEvent =
  | { type: 'pass-mystery-circle'; id: string }
  | { type: 'absorb-water'; litres: number }
  /** Points banked by the tractor beam. Laser kills never come through here. */
  | { type: 'absorb-score'; score: number }
  /** Points banked by blowing something up, city or aircraft alike. */
  | { type: 'destroy-score'; score: number }

function targetFor(id: MissionQuestId, stageStartedAt: number) {
  return id === 'final-sweep'
    ? Math.max(1, MISSION_RUN_SECONDS - stageStartedAt)
    : MISSION_TARGETS[id]
}

function makeQuest(id: MissionQuestId, stageStartedAt: number): MissionQuest {
  return { id, progress: 0, target: targetFor(id, stageStartedAt), complete: false }
}

export function createMissionState(): MissionState {
  return {
    stage: 0,
    quest: null,
    stageStartedAt: 0,
    totals: { circles: [], water: 0, absorbScore: 0, destroyScore: 0 },
    debriefs: [],
    revision: 0,
  }
}

/** What the active gauge reads, straight off the run totals. */
function rawProgress(state: MissionState, id: MissionQuestId, elapsed: number) {
  if (id === 'visit-mystery-circle') return state.totals.circles.length
  if (id === 'absorb-water') return state.totals.water
  if (id === 'absorb-samples') return state.totals.absorbScore
  if (id === 'wreck-city') return state.totals.destroyScore
  return Math.max(0, elapsed - state.stageStartedAt)
}

function openNextMission(state: MissionState, finished: MissionQuestId, elapsed: number) {
  state.revision += 1
  if (state.stage >= MISSION_COUNT) {
    // The last rung is the clock itself, so clearing it ends the run rather
    // than opening anything. The results screen speaks for the general here.
    state.stage = MISSION_COUNT + 1
    state.quest = null
    return
  }
  // Anything that reaches here is one of the first four rungs, and those are
  // exactly the debriefed ones - the last is handled by the branch above.
  if (finished !== 'final-sweep') state.debriefs.push(finished)
  state.stage += 1
  state.stageStartedAt = elapsed
  state.quest = makeQuest(MISSION_ORDER[state.stage - 1]!, elapsed)
}

/**
 * Re-reads the active gauge and advances as far as the totals allow.
 *
 * The loop is not defensive coding: because the meters run for the whole
 * flight, a rung really can open with its gauge already past the target, and
 * a single step would leave the board one mission behind what the pilot has
 * actually done.
 */
function refresh(state: MissionState, elapsed: number) {
  let changed = false
  for (let guard = 0; guard <= MISSION_COUNT; guard += 1) {
    const quest = state.quest
    if (!quest || state.stage < 1 || state.stage > MISSION_COUNT) break
    const next = Math.min(quest.target, rawProgress(state, quest.id, elapsed))
    if (next !== quest.progress) {
      quest.progress = next
      changed = true
    }
    // The last rung is never finished from in here: only the runtime, which
    // owns the clock, can say the clock is out. See closeRecon.
    if (quest.id === 'final-sweep' || quest.progress < quest.target) break
    quest.complete = true
    changed = true
    openNextMission(state, quest.id, elapsed)
  }
  return changed
}

/** The tutorial cat is the gate into the timed run. */
export function startMissionOne(state: MissionState, elapsed = 0) {
  if (state.stage !== 0) return state
  state.stage = 1
  state.stageStartedAt = elapsed
  state.quest = makeQuest(MISSION_ORDER[0]!, elapsed)
  state.revision += 1
  refresh(state, elapsed)
  return state
}

/**
 * Jump straight to the last rung, for the developer drill that opens on the
 * dreadnought.
 *
 * Ordinary play reaches the final sweep by clearing the four before it, and
 * that is not a rule worth loosening for a debug entry point - so this walks
 * the same ladder the run does rather than writing the stage in by hand, and
 * the drill gets the board a real late run arrives at. The debriefs it steps
 * over are dropped: the drill is there to look at the fight, not to be talked
 * through four lessons first.
 */
export function startFinalMission(state: MissionState, elapsed = 0) {
  state.stage = MISSION_COUNT
  state.stageStartedAt = elapsed
  state.quest = makeQuest('final-sweep', elapsed)
  state.debriefs.length = 0
  state.revision += 1
  return state
}

export function recordMissionEvent(state: MissionState, event: MissionEvent, elapsed: number) {
  // Nothing banks during the tutorial (there is no board yet) or after the
  // recon closes (there is no run left to bank into).
  if (state.stage < 1 || state.stage > MISSION_COUNT) return false
  const totals = state.totals
  if (event.type === 'pass-mystery-circle') {
    if (totals.circles.includes(event.id)) return false
    totals.circles.push(event.id)
  } else if (event.type === 'absorb-water') {
    if (event.litres <= 0) return false
    totals.water += event.litres
  } else if (event.type === 'absorb-score') {
    if (event.score <= 0) return false
    totals.absorbScore += event.score
  } else if (event.type === 'destroy-score') {
    if (event.score <= 0) return false
    totals.destroyScore += event.score
  } else return false
  refresh(state, elapsed)
  return true
}

/** Time is a value, not an event, so the final rung's gauge synchronizes
 *  instead. This never ends the run - closeRecon does. */
export function syncMissionState(state: MissionState, elapsed: number) {
  refresh(state, elapsed)
  return isReconComplete(state)
}

/**
 * The clock has run out. Returns whether the recon came home finished.
 *
 * Only the runtime may call this, because only the runtime owns the clock.
 * Deriving "the clock is out" in here from an elapsed value counted *up*,
 * while the runtime counts a separate remaining value *down*, leaves the two
 * disagreeing by a float epsilon on the exact frame it matters - and that
 * frame decides whether a pilot who flew the whole window is told they
 * finished the job or failed it.
 */
export function closeRecon(state: MissionState, elapsed: number) {
  const quest = state.quest
  if (state.stage === MISSION_COUNT && quest) {
    quest.progress = quest.target
    quest.complete = true
    openNextMission(state, quest.id, elapsed)
  }
  return isReconComplete(state)
}

/** The one victory condition: the last rung cleared, which only the clock can
 *  do. Everything else the run can end as is a failure or a shoot-down. */
export function isReconComplete(state: MissionState) {
  return state.stage > MISSION_COUNT
}

export function missionHasQuest(state: MissionState, id: MissionQuestId) {
  return state.quest?.id === id && !state.quest.complete
}

/** The debrief the general still owes, without consuming it. */
export function peekMissionDebrief(state: MissionState): MissionDebriefId | null {
  return state.debriefs[0] ?? null
}

/** Consumes one debrief. Called when the pilot clicks the general away. */
export function takeMissionDebrief(state: MissionState): MissionDebriefId | null {
  return state.debriefs.shift() ?? null
}

/**
 * The three-stage reconnaissance assignment.
 *
 * This module deliberately knows nothing about React or Three.js. The runtime
 * reports things that happened, and this state machine owns selection,
 * parallel progress, stage gates and the only victory condition.
 */

export const MISSION_RUN_SECONDS = 300
export const MISSION_SCORE_TARGET = 7200
export const AIR_CHECKPOINT_RADIUS = 5

type Point3 = { x: number; y: number; z: number }

/** Crossing the ring is enough; checkpoint missions never require hovering. */
export function isInsideAirCheckpoint(position: Point3, checkpoint: Point3) {
  return Math.hypot(
    position.x - checkpoint.x,
    position.y - checkpoint.y,
    position.z - checkpoint.z,
  ) <= AIR_CHECKPOINT_RADIUS
}

export type MissionQuestId =
  | 'capture-cats'
  | 'capture-people'
  | 'destroy-cars'
  | 'destroy-trucks'
  | 'destroy-tankers'
  | 'absorb-water'
  | 'ruin-buildings'
  | 'destroy-comms'
  | 'destroy-drones'
  | 'destroy-fighters'
  | 'absorb-rooftop-structures'
  | 'absorb-trees'
  | 'absorb-streetlights'
  | 'pass-mystery-circles'
  | 'air-checkpoints'
  | 'destroy-battleship'
  | 'reach-score'
  | 'survive-final'

export type MissionQuest = {
  id: MissionQuestId
  progress: number
  target: number
  complete: boolean
}

export type MissionState = {
  /** 0 is the cat tutorial, 1..3 are missions, 4 is reconnaissance complete. */
  stage: 0 | 1 | 2 | 3 | 4
  quests: MissionQuest[]
  randomState: number
  stageStartedAt: number
  completedQuest: MissionQuestId | null
  revision: number
  /** Circle IDs already counted for the active mission stage. */
  mysteryCircleIds: string[]
}

export type MissionEvent =
  | { type: 'capture-cat'; amount?: number }
  | { type: 'capture-person'; amount?: number }
  | { type: 'destroy-car'; amount?: number }
  | { type: 'destroy-truck'; amount?: number }
  | { type: 'destroy-tanker'; amount?: number }
  | { type: 'absorb-water'; litres: number }
  | { type: 'ruin-building'; amount?: number }
  | { type: 'destroy-comms'; amount?: number }
  | { type: 'destroy-enemy'; kind: 'drone' | 'fighter' | 'boss' | string; amount?: number }
  | { type: 'absorb-rooftop-structure'; amount?: number }
  | { type: 'absorb-tree'; amount?: number }
  | { type: 'absorb-streetlight'; amount?: number }
  | { type: 'pass-mystery-circle'; id: string }
  | { type: 'pass-checkpoint'; amount?: number }

export const MISSION_ONE_POOL: readonly MissionQuestId[] = [
  'capture-cats',
  'capture-people',
  'destroy-cars',
  'destroy-trucks',
  'destroy-tankers',
  'absorb-water',
  'pass-mystery-circles',
]

export const MISSION_TWO_POOL: readonly MissionQuestId[] = [
  'ruin-buildings',
  'destroy-comms',
  'destroy-drones',
  'destroy-fighters',
  'absorb-rooftop-structures',
  'absorb-trees',
  'absorb-streetlights',
  'air-checkpoints',
]

/** Only one rare landmark hunt may be drawn into a single mission. The gas
 *  station hunt left the pool, so comms is the group's lone member - kept as a
 *  group so the next rare hunt slots in beside it. */
export const MISSION_QUEST_GROUPS: Partial<Record<MissionQuestId, string>> = {
  'destroy-comms': 'rare-landmark',
}

export const MISSION_THREE_QUESTS: readonly MissionQuestId[] = [
  'destroy-battleship',
  'reach-score',
  'survive-final',
]

export const MISSION_TARGETS: Record<MissionQuestId, number> = {
  'capture-cats': 6,
  'capture-people': 10,
  'destroy-cars': 8,
  'destroy-trucks': 5,
  // Tankers are the rare heavy vehicle - they only start rolling at 25s and
  // cap out at a handful on the map - so the hunt asks for fewer of them.
  'destroy-tankers': 3,
  'absorb-water': 300,
  'ruin-buildings': 3,
  'destroy-comms': 1,
  'destroy-drones': 10,
  'destroy-fighters': 5,
  'absorb-rooftop-structures': 5,
  'absorb-trees': 5,
  'absorb-streetlights': 4,
  'pass-mystery-circles': 3,
  'air-checkpoints': 3,
  'destroy-battleship': 1,
  'reach-score': MISSION_SCORE_TARGET,
  // Replaced with the time left in the run when mission three opens.
  'survive-final': 120,
}

function random(state: MissionState) {
  let value = state.randomState || 1
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  state.randomState = value >>> 0 || 1
  return state.randomState / 0xffffffff
}

export function pickDistinctMissionQuests(
  state: MissionState,
  pool: readonly MissionQuestId[],
  count = 3,
) {
  const available = [...pool]
  const picked: MissionQuestId[] = []
  while (picked.length < count && available.length > 0) {
    const index = Math.floor(random(state) * available.length) % available.length
    const candidate = available.splice(index, 1)[0]!
    const group = MISSION_QUEST_GROUPS[candidate]
    if (group && picked.some((id) => MISSION_QUEST_GROUPS[id] === group)) continue
    picked.push(candidate)
  }
  return picked
}

function makeQuest(id: MissionQuestId, stageStartedAt: number): MissionQuest {
  const target = id === 'survive-final'
    ? Math.max(0, MISSION_RUN_SECONDS - stageStartedAt)
    : MISSION_TARGETS[id]
  return { id, progress: 0, target, complete: false }
}

export function createMissionState(seed = 1): MissionState {
  return {
    stage: 0,
    quests: [],
    randomState: seed >>> 0 || 1,
    stageStartedAt: 0,
    completedQuest: null,
    revision: 0,
    mysteryCircleIds: [],
  }
}

function assignStage(state: MissionState, stage: 1 | 2 | 3, elapsed: number) {
  state.stage = stage
  state.stageStartedAt = elapsed
  const pool = stage === 1 ? MISSION_ONE_POOL : MISSION_TWO_POOL
  const ids = stage === 3
    ? [...MISSION_THREE_QUESTS]
    : stage === 1
      ? [
          'pass-mystery-circles' as const,
          ...pickDistinctMissionQuests(state, pool.filter((id) => id !== 'pass-mystery-circles'), 2),
        ]
      : pickDistinctMissionQuests(state, pool, 3)

  // Mission one always contains the circle objective, but its HUD position
  // changes so the first slot does not always show the same quest.
  if (stage === 1) {
    for (let index = ids.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random(state) * (index + 1))
      const current = ids[index]!
      ids[index] = ids[swapIndex]!
      ids[swapIndex] = current
    }
  }
  state.quests = ids.map((id) => makeQuest(id, elapsed))
  state.mysteryCircleIds = []
  state.completedQuest = null
  state.revision += 1
  return state
}

/** The tutorial cat is the gate into the timed run. */
export function startMissionOne(state: MissionState, elapsed = 0) {
  if (state.stage !== 0) return state
  return assignStage(state, 1, elapsed)
}

function finishCompletedStage(state: MissionState, elapsed: number) {
  if (state.quests.length !== 3 || !state.quests.every((quest) => quest.complete)) return false
  if (state.stage === 1) assignStage(state, 2, elapsed)
  else if (state.stage === 2) assignStage(state, 3, elapsed)
  else if (state.stage === 3) {
    state.stage = 4
    state.revision += 1
  }
  return true
}

function addProgress(state: MissionState, id: MissionQuestId, amount: number) {
  const quest = state.quests.find((candidate) => candidate.id === id)
  if (!quest || quest.complete || amount <= 0) return false
  quest.progress = Math.min(quest.target, quest.progress + amount)
  if (quest.progress >= quest.target) {
    quest.complete = true
    state.completedQuest = id
    state.revision += 1
  }
  return true
}

export function recordMissionEvent(state: MissionState, event: MissionEvent, elapsed: number) {
  if (state.stage < 1 || state.stage > 3) return false
  const amount = 'amount' in event ? event.amount ?? 1 : 1
  let changed = false
  if (event.type === 'capture-cat') changed = addProgress(state, 'capture-cats', amount)
  else if (event.type === 'capture-person') changed = addProgress(state, 'capture-people', amount)
  else if (event.type === 'destroy-car') changed = addProgress(state, 'destroy-cars', amount)
  else if (event.type === 'destroy-truck') changed = addProgress(state, 'destroy-trucks', amount)
  else if (event.type === 'destroy-tanker') changed = addProgress(state, 'destroy-tankers', amount)
  else if (event.type === 'absorb-water') changed = addProgress(state, 'absorb-water', event.litres)
  else if (event.type === 'ruin-building') changed = addProgress(state, 'ruin-buildings', amount)
  else if (event.type === 'destroy-comms') changed = addProgress(state, 'destroy-comms', amount)
  else if (event.type === 'absorb-rooftop-structure') changed = addProgress(state, 'absorb-rooftop-structures', amount)
  else if (event.type === 'absorb-tree') changed = addProgress(state, 'absorb-trees', amount)
  else if (event.type === 'absorb-streetlight') changed = addProgress(state, 'absorb-streetlights', amount)
  else if (event.type === 'pass-mystery-circle') {
    const quest = state.quests.find((candidate) => candidate.id === 'pass-mystery-circles')
    if (quest && !quest.complete && !state.mysteryCircleIds.includes(event.id)) {
      state.mysteryCircleIds.push(event.id)
      changed = addProgress(state, 'pass-mystery-circles', 1)
    }
  }
  else if (event.type === 'pass-checkpoint') changed = addProgress(state, 'air-checkpoints', amount)
  else if (event.type === 'destroy-enemy') {
    if (event.kind === 'drone') changed = addProgress(state, 'destroy-drones', amount)
    else if (event.kind === 'fighter') changed = addProgress(state, 'destroy-fighters', amount)
    else if (event.kind === 'boss') changed = addProgress(state, 'destroy-battleship', amount)
  }
  finishCompletedStage(state, elapsed)
  return changed
}

/** Score and survival are values, not one-shot events, so they synchronize. */
export function syncMissionState(state: MissionState, elapsed: number, score: number) {
  if (state.stage !== 3) return state.stage === 4
  const scoreQuest = state.quests.find((quest) => quest.id === 'reach-score')
  if (scoreQuest && !scoreQuest.complete) {
    scoreQuest.progress = Math.min(scoreQuest.target, Math.max(0, score))
    if (scoreQuest.progress >= scoreQuest.target) {
      scoreQuest.complete = true
      state.completedQuest = scoreQuest.id
      state.revision += 1
    }
  }
  const survival = state.quests.find((quest) => quest.id === 'survive-final')
  if (survival && !survival.complete) {
    survival.progress = Math.min(survival.target, Math.max(0, elapsed - state.stageStartedAt))
    if (elapsed >= MISSION_RUN_SECONDS) {
      survival.progress = survival.target
      survival.complete = true
      state.completedQuest = survival.id
      state.revision += 1
    }
  }
  return finishCompletedStage(state, elapsed)
}

export function missionHasQuest(state: MissionState, id: MissionQuestId) {
  return state.stage >= 1 && state.stage <= 3 && state.quests.some((quest) => quest.id === id && !quest.complete)
}

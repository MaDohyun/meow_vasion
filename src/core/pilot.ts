export type PilotExpression =
  | 'normal'
  | 'blink'
  | 'focus'
  | 'excited'
  | 'boost'
  | 'surprise'
  | 'sweat'
  | 'scream'
  | 'glare'
  | 'victory'
  | 'defeat'

export type PilotSignals = {
  elapsed: number
  impact: boolean
  threatLevel: number
  threatIncreased: boolean
  cargoIncreased: boolean
  phase: 'intro' | 'playing' | 'results'
  victory: boolean
  boost: boolean
  beam: boolean
  laser: boolean
}

export type PilotExpressionState = {
  expression: PilotExpression
  holdUntil: number
}

const PRIORITY: Record<PilotExpression, number> = {
  normal: 0,
  blink: 1,
  excited: 30,
  sweat: 38,
  focus: 45,
  glare: 52,
  boost: 60,
  victory: 70,
  defeat: 70,
  scream: 80,
  surprise: 90,
}

export function requestedPilotExpression(signals: PilotSignals): PilotExpression {
  if (signals.impact) return 'surprise'
  if (signals.threatLevel >= 5) return 'scream'
  if (signals.phase === 'results') return signals.victory ? 'victory' : 'defeat'
  if (signals.boost) return 'boost'
  if (signals.laser) return 'glare'
  if (signals.beam) return 'focus'
  if (signals.threatIncreased) return 'sweat'
  if (signals.cargoIncreased) return 'excited'
  return signals.elapsed % 4.2 > 4.06 ? 'blink' : 'normal'
}

export function updatePilotExpression(
  state: PilotExpressionState,
  requested: PilotExpression,
  elapsed: number,
  minimumHold = 0.4,
): PilotExpressionState {
  if (requested === state.expression) return state
  if (elapsed < state.holdUntil && PRIORITY[requested] <= PRIORITY[state.expression]) return state
  return { expression: requested, holdUntil: elapsed + minimumHold }
}

import { describe, expect, it } from 'vitest'
import { requestedPilotExpression, updatePilotExpression } from '../src/core/pilot'

const signals = {
  elapsed: 1,
  impact: false,
  wanted: 0,
  wantedIncreased: false,
  carriedIncreased: false,
  phase: 'playing' as const,
  victory: false,
  boost: false,
  beam: false,
  laser: false,
}

describe('pilot expression director', () => {
  it('uses the gameplay priority order', () => {
    expect(requestedPilotExpression({ ...signals, carriedIncreased: true })).toBe('excited')
    expect(requestedPilotExpression({ ...signals, carriedIncreased: true, beam: true })).toBe('focus')
    expect(requestedPilotExpression({ ...signals, beam: true, boost: true })).toBe('boost')
    expect(requestedPilotExpression({ ...signals, boost: true, wanted: 5 })).toBe('scream')
    expect(requestedPilotExpression({ ...signals, wanted: 5, impact: true })).toBe('surprise')
  })

  it('holds an event expression for at least 0.4 seconds unless a higher priority arrives', () => {
    const surprise = updatePilotExpression({ expression: 'normal', holdUntil: 0 }, 'surprise', 2)
    expect(surprise.holdUntil).toBeCloseTo(2.4)
    expect(updatePilotExpression(surprise, 'normal', 2.2)).toBe(surprise)
    expect(updatePilotExpression(surprise, 'normal', 2.41).expression).toBe('normal')

    const excited = updatePilotExpression({ expression: 'excited', holdUntil: 4 }, 'boost', 3.7)
    expect(excited.expression).toBe('boost')
  })
})

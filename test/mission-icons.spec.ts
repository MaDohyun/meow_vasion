import { describe, expect, it } from 'vitest'
import { MISSION_ICONS } from '../src/ui/missionIcons'
import { MISSION_COUNT, MISSION_TARGETS, type MissionQuestId } from '../src/core/missions'

/**
 * The mission card is read by its glyph before it is read by its words, so an
 * objective that shipped without one would leave a blank cell and knock the
 * row out of line with the gauge under it.
 */
describe('mission glyphs', () => {
  const ids = Object.keys(MISSION_TARGETS) as MissionQuestId[]

  it('gives every objective a glyph', () => {
    expect(ids.length).toBe(MISSION_COUNT)
    for (const id of ids) expect(MISSION_ICONS[id], id).toBeTruthy()
  })

  it('carries no glyph for an objective that no longer exists', () => {
    expect(Object.keys(MISSION_ICONS).sort()).toEqual([...ids].sort())
  })
})

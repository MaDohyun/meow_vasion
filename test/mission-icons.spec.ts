import { describe, expect, it } from 'vitest'
// Read as text rather than through node:fs so the suite needs no node types.
import css from '../src/styles.css?raw'
import hud from '../src/ui/Hud.tsx?raw'
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

/**
 * The gauge is a bar whose width is the objective's ratio, so anything that
 * constrains the width of its fill makes the bar lie about the progress.
 *
 * It did. `.mission-panel > div` styled the objective row, and the gauge is a
 * direct div of the same panel, so the gauge inherited a three-column grid and
 * its fill landed in the fixed 24px glyph column: a "full" gauge was a 24px
 * stub and every partial reading was a fraction of that stub. Cheap to
 * re-introduce by adding a row and reaching for `> div` again, so the source
 * is asserted rather than the pixels - there is no DOM in this suite.
 */
describe('mission gauge markup', () => {
  it('never styles the mission panel by bare child div, which would catch the gauge', () => {
    expect(css).not.toMatch(/\.mission-panel\s*>\s*div/)
  })

  it('keeps the objective row on the class the panel rules target', () => {
    expect(hud).toContain('className="mission-row"')
    expect(css).toMatch(/\.mission-panel\s*>\s*\.mission-row\s*\{/)
  })

  it('leaves the gauge fill free to span the full bar', () => {
    // A grid or flex container would place the fill in a track; the gauge has
    // to stay a plain block so `width: NN%` is NN% of the bar.
    const gauge = css.match(/^\.mission-gauge \{[^}]*\}/m)?.[0] ?? ''
    expect(gauge).toBeTruthy()
    expect(gauge).not.toMatch(/display\s*:\s*(grid|flex)/)
  })
})

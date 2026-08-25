import type { MissionQuestId } from '../core/missions'

/**
 * One glyph per objective.
 *
 * The mission card is the only panel a player reads while flying, and reading
 * it used to mean parsing a line of Korean prose to find the number still left
 * on it. A glyph is picked out before the sentence beside it is read, so the
 * card becomes a shape to recognise rather than a paragraph - which is the
 * whole job it has mid-flight.
 *
 * Every id has to carry one, so the record is exhaustive rather than partial:
 * a new objective that forgot its icon would otherwise ship as a blank column
 * that quietly knocks the list out of alignment.
 */
export const MISSION_ICONS: Record<MissionQuestId, string> = {
  'visit-mystery-circle': '🌀',
  'absorb-water': '💧',
  'absorb-samples': '🧪',
  'wreck-city': '💥',
  'final-sweep': '⏳',
}

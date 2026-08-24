import type { MissionQuestId } from '../core/missions'

/**
 * One glyph per objective.
 *
 * The mission list is the only panel a player reads while flying, and reading
 * it used to mean parsing three lines of Korean prose to find the one that
 * still has a number left on it. A glyph is picked out before the sentence
 * beside it is read, so the list becomes a shape to scan rather than a
 * paragraph - which is the whole job it has mid-flight.
 *
 * Every id has to carry one, so the record is exhaustive rather than partial:
 * a new objective that forgot its icon would otherwise ship as a blank column
 * that quietly knocks the list out of alignment.
 */
export const MISSION_ICONS: Record<MissionQuestId, string> = {
  'capture-cats': '🐱',
  'capture-people': '🧍',
  'destroy-cars': '🚗',
  'destroy-trucks': '🚚',
  'destroy-tankers': '🛢️',
  'absorb-water': '💧',
  'ruin-buildings': '🏢',
  'destroy-comms': '📡',
  'destroy-drones': '💣',
  'destroy-fighters': '✈️',
  'absorb-rooftop-structures': '🏗️',
  'absorb-trees': '🌳',
  'absorb-streetlights': '💡',
  'pass-mystery-circles': '🌀',
  'air-checkpoints': '⭕',
  'destroy-battleship': '🚀',
  'reach-score': '⭐',
  'survive-final': '⏳',
}

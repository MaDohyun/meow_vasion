import { ENEMY_WAVE_STAGES, waveStageForTime } from './enemies'

/**
 * Wave escalation, told as a news bulletin.
 *
 * The wave table already decides when the sky gets busier. What it never did
 * was say why. A stylised `FIGHTER SCRAMBLE` label flashing for two seconds is
 * a scoreboard entry, not an event - the player learns that something changed
 * only by being shot at by something new.
 *
 * So each wave step also fires a bulletin: the anchor already on the city's
 * news towers reports what the government just did. One step per unit means
 * one bulletin per unit - sighting, drones, helicopters, fighters, the air
 * defence network, and finally the ship. The ship's destruction gets one
 * unscheduled after-action bulletin as well: Earth reports its final defence
 * line breached while the general calls the resistance crushed and orders the
 * raid to continue. The text itself lives in `src/i18n.ts`; this module owns
 * only the timing, which the HUD band and the building screen both read so
 * they stay on air together.
 */

/**
 * When the opening bulletin goes on air.
 *
 * Not at zero. For the first few seconds the player is still working out
 * which way the craft is pointing, and a band that slides up while they are
 * doing that is text nobody reads. Ten seconds in they are already flying,
 * and the sighting report lands as the world noticing them rather than as a
 * title card - which is also the right order for a news programme: the event
 * first, the response after.
 *
 * Measured in game time, which the opening tutorial holds at zero. Ten
 * seconds of a craft parked over a cat with its flight controls inert is not
 * a sighting anybody would report.
 */
export const BROADCAST_OPENING_AT = 10

/** How long one bulletin stays on air. Long enough to read two lines at a
 *  glance while flying, short enough that it is gone before the wave it
 *  announces has finished arriving. */
export const BROADCAST_SECONDS = 6

/** The slide-in and slide-out. A bulletin that pops would read as an error
 *  dialog; a broadcast band belongs to the bottom of the screen and has to
 *  arrive from there. */
export const BROADCAST_OPEN_SECONDS = 0.45
export const BROADCAST_CLOSE_SECONDS = 0.55

/** Wave cards occupy their wave indices. The one field event follows them so
 *  it cannot collide with an index the deterministic clock owns. */
export const BATTLESHIP_DOWN_BROADCAST_STAGE = ENEMY_WAVE_STAGES.length

/** One bulletin per wave stage, plus the battleship after-action report. */
export const BROADCAST_COUNT = ENEMY_WAVE_STAGES.length + 1

export type BroadcastPhase = 'opening' | 'holding' | 'closing' | 'off'

/** Which wave stage the clock is in - the same boundaries the spawner uses, so
 *  the bulletin cannot announce a wave that has not started. */
export function broadcastStageForTime(elapsed: number) {
  return waveStageForTime(elapsed)
}

export function broadcastPhase(remaining: number): BroadcastPhase {
  if (remaining <= 0) return 'off'
  if (remaining <= BROADCAST_CLOSE_SECONDS) return 'closing'
  if (remaining >= BROADCAST_SECONDS - BROADCAST_OPEN_SECONDS) return 'opening'
  return 'holding'
}

/** 0 at the moment it goes on air, 1 as it leaves. Drives the countdown bar. */
export function broadcastProgress(remaining: number) {
  return Math.min(1, Math.max(0, 1 - remaining / BROADCAST_SECONDS))
}

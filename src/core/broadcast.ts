import { ENEMY_WAVE_STAGES, waveStageForTime } from './enemies'

/**
 * Wave escalation, told as a news bulletin.
 *
 * The wave table already decides when the sky gets busier. What it never did
 * was say why. A stylised `FIGHTER SCRAMBLE` label flashing for two seconds is
 * a scoreboard entry, not an event - the player learns that something changed
 * only by being shot at by something new.
 *
 * So each of the eight wave steps also fires a bulletin: the anchor already on
 * the city's news towers reports what the government just did. The text itself
 * lives in `src/i18n.ts`, one pair per stage per language; this module owns
 * only the timing, which the HUD band and the building screen both read so
 * they stay on air together.
 */

/** How long one bulletin stays on air. Long enough to read two lines at a
 *  glance while flying, short enough that it is gone before the wave it
 *  announces has finished arriving. */
export const BROADCAST_SECONDS = 6

/** The slide-in and slide-out. A bulletin that pops would read as an error
 *  dialog; a broadcast band belongs to the bottom of the screen and has to
 *  arrive from there. */
export const BROADCAST_OPEN_SECONDS = 0.45
export const BROADCAST_CLOSE_SECONDS = 0.55

/** One bulletin per wave stage, so a missing entry is a build error. */
export const BROADCAST_COUNT = ENEMY_WAVE_STAGES.length

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

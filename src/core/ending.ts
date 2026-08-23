/**
 * How a run ended.
 *
 * The clock running out is not one outcome but two. Surviving the full recon
 * window and surviving it *with the mission done* are different results, and
 * the screen that reports them is the only place the player finds out which
 * one they got - a run that outlasted the clock and still failed the mission
 * used to be told it had been shot down.
 *
 * Being shot down is the third, and it reads like neither: the run stopped
 * early, so there is no question of the mission at all.
 */
export type RunEnding = 'recon' | 'missionFailed' | 'downed'

/** The clock reached zero with the craft still flying. Whether that is a win
 * is entirely the mission's answer to give. */
export function endingForTimeUp(missionComplete: boolean): RunEnding {
  return missionComplete ? 'recon' : 'missionFailed'
}

/** One ending wins. Outlasting the clock is the price of entry, not the prize:
 * the recon has to come back finished. */
export function isVictory(ending: RunEnding) {
  return ending === 'recon'
}

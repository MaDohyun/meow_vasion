/**
 * How a run ended.
 *
 * The clock running out is not one outcome but two. Surviving the full recon
 * window and surviving it *with the mission done* are different results, and
 * the screen that reports them is the only place the player finds out which
 * one they got - a run that outlasted the clock and still failed the mission
 * used to be told it had been shot down.
 *
 * One ending stops the run early, and it is the city's: being shot down.
 *
 * There used to be a second early ending - going down under the weight on the
 * beam - and it is gone. The sinking that led to it is not: an overloaded
 * craft still loses its climb and rides down toward the street, and the alarm
 * still says so. What was removed is the floor it hit. A player who can see
 * the craft sinking and can stop it at any moment by letting go does not also
 * need to be killed for it, and being killed for it taught nothing the sinking
 * had not already said.
 *
 * Being shot down has no mission verdict to give.
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

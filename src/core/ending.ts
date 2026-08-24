/**
 * How a run ended.
 *
 * The clock running out is not one outcome but two. Surviving the full recon
 * window and surviving it *with the mission done* are different results, and
 * the screen that reports them is the only place the player finds out which
 * one they got - a run that outlasted the clock and still failed the mission
 * used to be told it had been shot down.
 *
 * Two more stop the run early, and they are not the same as each other. Being
 * shot down is the city winning the fight. Going down under the load is the
 * player's own haul winning one: nothing hit the craft, it simply hung more
 * weight off the beam than the engines could hold and rode it into the
 * ground. Filing that as a shoot-down hid the only thing the player could
 * have done about it - let go.
 *
 * Neither early ending has a mission verdict to give.
 */
export type RunEnding = 'recon' | 'missionFailed' | 'downed' | 'crushed'

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

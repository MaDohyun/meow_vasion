import type { CSSProperties } from 'react'
import type { PilotExpression } from '../core/pilot'

/**
 * The pilot portrait is the player-supplied cat-bot art (public/pilot/*),
 * not code-drawn. core/pilot.ts still tracks eleven finer-grained expressions
 * for priority/holding, but only four portraits exist, so they collapse onto
 * whichever mood the reference art actually covers: calm, angry-attack,
 * happy-boost, startled-hit.
 */
type Mood = 'neutral' | 'angry' | 'happy' | 'hurt'

const MOOD_IMAGE: Record<Mood, string> = {
  neutral: '/pilot/neutral.png',
  angry: '/pilot/angry.jpg',
  happy: '/pilot/happy.png',
  hurt: '/pilot/hurt.png',
}

function moodFor(expression: PilotExpression): Mood {
  switch (expression) {
    case 'glare':
    case 'focus':
    case 'scream':
      return 'angry'
    case 'boost':
    case 'excited':
    case 'victory':
      return 'happy'
    case 'surprise':
    case 'sweat':
    case 'defeat':
      return 'hurt'
    default:
      return 'neutral'
  }
}

export function pilotFrameStyle(expression: PilotExpression): CSSProperties {
  return {
    backgroundImage: `url(${MOOD_IMAGE[moodFor(expression)]})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}

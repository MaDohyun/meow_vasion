/**
 * The hull, drawn as pixel hearts.
 *
 * It used to be five green blocks sharing the mass card's colour, and players
 * read them as a progress bar rather than as lives - "how full is this?"
 * instead of "how many hits do I have left?". A heart carries that meaning
 * before anyone reads the label under it.
 *
 * Damage lands in half pips (see HEALTH_LOSS), so a heart has to be able to
 * show a half. Rather than three sprites, each heart is the same pixel run
 * drawn twice - once dark, once lit - with the lit copy's rectangles trimmed
 * at the fill line. A 0.5 heart is then literally the left half of the pixels,
 * which is what a pixel-art half-heart is.
 */

/** One heart as `[x, y, width]` runs on a 9x8 grid, top row first. */
const HEART_PIXELS: readonly (readonly [number, number, number])[] = [
  [1, 0, 2], [6, 0, 2],
  [0, 1, 4], [5, 1, 4],
  [0, 2, 9],
  [0, 3, 9],
  [1, 4, 7],
  [2, 5, 5],
  [3, 6, 3],
  [4, 7, 1],
]

export const HEART_WIDTH = 9

/**
 * How much of one pixel run is lit, for a heart filled `fill` of the way.
 *
 * The fill line is vertical and shared by every row, so a run is either whole,
 * clipped where the line crosses it, or entirely past it. That is what makes
 * a half heart come out as the left half of the sprite rather than as a
 * shorter heart.
 *
 * @param x     the run's left edge on the 9-wide grid
 * @param width the run's width
 * @param fill  0..1; values outside that range are clamped
 */
export function litRunWidth(x: number, width: number, fill: number) {
  const edge = Math.max(0, Math.min(1, fill)) * HEART_WIDTH
  return Math.max(0, Math.min(width, edge - x))
}

export function heartState(fill: number) {
  return fill >= 1 ? 'full' : fill > 0 ? 'part' : 'empty'
}

function Heart({ fill }: { fill: number }) {
  return (
    <svg className="pixel-heart" viewBox={`0 0 ${HEART_WIDTH} 8`} data-state={heartState(fill)} aria-hidden="true">
      <g className="heart-shell">
        {HEART_PIXELS.map(([x, y, width]) => (
          <rect key={`shell-${x}-${y}`} x={x} y={y} width={width} height={1} />
        ))}
      </g>
      <g className="heart-core">
        {HEART_PIXELS.map(([x, y, width]) => {
          const lit = litRunWidth(x, width, fill)
          if (lit <= 0) return null
          return <rect key={`core-${x}-${y}`} x={x} y={y} width={lit} height={1} />
        })}
      </g>
    </svg>
  )
}

export function LifeHearts({
  current,
  max,
  regenerating,
  label,
}: {
  current: number
  max: number
  regenerating: boolean
  label: string
}) {
  return (
    <div
      className="life-hearts"
      data-regen={regenerating}
      data-critical={max > 0 && current <= 1}
      role="img"
      aria-label={`${label} ${Math.ceil(current)}/${max}`}
    >
      {Array.from({ length: max }, (_, pip) => (
        <Heart key={pip} fill={current - pip} />
      ))}
    </div>
  )
}

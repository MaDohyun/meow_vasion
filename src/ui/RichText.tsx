import { Fragment } from 'react'

/**
 * Renders a UI string with its `[[emphasised]]` spans lit up.
 *
 * The hazards that end a run - too much cargo, and clipping a building - are
 * the two things the HUD says in words rather than shows in a gauge, so they
 * are the two things a player skims past. The brackets mark the clause that
 * has to survive the skim; everything else renders unchanged.
 *
 * The markers live in the translations (see i18n.ts) because where the warning
 * falls in a sentence is a per-language decision.
 */

const EMPHASIS = /\[\[([\s\S]+?)\]\]/g

export function RichText({ text }: { text: string }) {
  const parts: { text: string; warn: boolean }[] = []
  let cursor = 0
  for (const match of text.matchAll(EMPHASIS)) {
    const at = match.index ?? 0
    if (at > cursor) parts.push({ text: text.slice(cursor, at), warn: false })
    parts.push({ text: match[1] ?? '', warn: true })
    cursor = at + match[0].length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), warn: false })
  return (
    <>
      {parts.map((part, index) =>
        part.warn
          ? <em key={index} className="hud-warn">{part.text}</em>
          : <Fragment key={index}>{part.text}</Fragment>,
      )}
    </>
  )
}

/** The same string with its markers stripped, for `aria-label` and `title`. */
export function plainText(text: string) {
  return text.replace(EMPHASIS, '$1')
}

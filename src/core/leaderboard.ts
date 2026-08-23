/**
 * The ranking board - what a record is, and how records are ordered.
 *
 * Kept in `core` and free of browser, React and network code for the usual
 * reason: the ordering rules and the name handling are the part that has to be
 * right, and they are much easier to prove right when a test can call them
 * directly. `src/net/leaderboard.ts` carries the Google Sheet traffic on top of
 * this, and the sheet-side Apps Script re-implements the same sanitising and
 * the same sort so that a hand-edited row or a replayed request cannot put the
 * board into a state the client would not have produced.
 *
 * A run ends with a score and a survival time. Both matter to the player, so
 * both are on the board, but only one of them can decide the order: score wins
 * because that is the number the results screen shouts, and survival time is
 * the tiebreaker because two identical scores are almost always the same
 * destruction done at different speed.
 */

/**
 * How long a name may be, counted in code points rather than UTF-16 units.
 *
 * Twelve is chosen from the board's width, not from storage: the table shows
 * rank, name, score and time in a row that has to stay readable on a phone.
 * Counting code points means a Korean or Japanese name gets twelve real
 * characters and an emoji counts as one, which is what a player typing into
 * the box expects.
 */
export const NAME_MAX_LENGTH = 12

/** How many rows the board keeps and shows. Beyond this nobody is reading. */
export const LEADERBOARD_LIMIT = 20

export type LeaderboardEntry = {
  name: string
  score: number
  /** Seconds survived, as the run reported them. */
  survivalTime: number
  waveStage: number
  victory: boolean
  /** Epoch milliseconds. Also the final, always-decisive tiebreaker. */
  recordedAt: number
}

export type RankedEntry = LeaderboardEntry & { rank: number }

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g
/** Zero-width and bidi-override characters: invisible in the box, disruptive
 *  on the board. Stripped rather than rejected so a paste still works. */
const INVISIBLE_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g

/**
 * Turn whatever is in the text box into something that can sit on the board.
 *
 * Sanitising rather than rejecting is deliberate. The player has just finished
 * a run and wants to sign it; bouncing them back to the form because they
 * pasted a newline is a worse experience than quietly taking the newline out.
 * The one thing this cannot do is invent a name, so an input that sanitises to
 * nothing stays empty and the caller refuses to submit it.
 */
export function sanitizeName(raw: string): string {
  const stripped = raw
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(stripped).slice(0, NAME_MAX_LENGTH).join('')
}

/** Whether this input, once sanitised, is a name the board can carry. */
export function isNameAcceptable(raw: string): boolean {
  return sanitizeName(raw).length > 0
}

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback)

/**
 * Build a submittable record from a finished run.
 *
 * Scores are floored and clamped at zero because the board is a list of whole
 * numbers, and because a NaN that reaches the sheet poisons every later sort.
 */
export function makeEntry(input: {
  name: string
  score: number
  survivalTime: number
  waveStage: number
  victory: boolean
  recordedAt: number
}): LeaderboardEntry {
  return {
    name: sanitizeName(input.name),
    score: Math.max(0, Math.floor(finite(input.score))),
    survivalTime: Math.max(0, finite(input.survivalTime)),
    waveStage: Math.max(0, Math.floor(finite(input.waveStage))),
    victory: input.victory === true,
    recordedAt: Math.floor(finite(input.recordedAt)),
  }
}

/**
 * The board's order: score first, then survival time, then who got there first.
 *
 * The last clause is what keeps the ordering total. Without it two runs that
 * tie on both numbers swap places every time the list is re-sorted, and the
 * player watches their own row jump around while they look at it.
 */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.score !== a.score) return b.score - a.score
  if (b.survivalTime !== a.survivalTime) return b.survivalTime - a.survivalTime
  return a.recordedAt - b.recordedAt
}

/**
 * Sort, cut to the visible length, and number the rows.
 *
 * Ranks are positions, not competition ranks: because the comparison above is
 * total, a shared rank could only come from two rows identical in every field,
 * and showing "3, 3, 5" for that costs more confusion than it buys fairness.
 */
export function rankEntries(entries: readonly LeaderboardEntry[], limit = LEADERBOARD_LIMIT): RankedEntry[] {
  return [...entries]
    .sort(compareEntries)
    .slice(0, Math.max(0, limit))
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
}

/**
 * Add one record to a board and return the new board.
 *
 * Takes the whole list rather than mutating so the caller can keep the old
 * board on screen if the write turns out to have failed.
 */
export function insertEntry(
  entries: readonly LeaderboardEntry[],
  entry: LeaderboardEntry,
  limit = LEADERBOARD_LIMIT,
): RankedEntry[] {
  return rankEntries([...entries, entry], limit)
}

/**
 * Where a specific record landed, or null if it fell off the visible board.
 *
 * Matched on the timestamp because that is the one field the player cannot
 * collide with by choosing the same name and hitting the same score.
 */
export function findRank(entries: readonly RankedEntry[], entry: LeaderboardEntry): number | null {
  const found = entries.find((row) => row.recordedAt === entry.recordedAt && row.name === entry.name)
  return found ? found.rank : null
}

/**
 * Accept a row that came back from the sheet.
 *
 * Anything on the far side of the network is untrusted input, including a
 * spreadsheet a human can type into by hand. A row missing a name or carrying
 * a non-numeric score is dropped rather than coerced, because a zero-score
 * row on the board looks like a bug in the game.
 */
export function parseEntry(raw: unknown): LeaderboardEntry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  const name = sanitizeName(typeof row.name === 'string' ? row.name : '')
  if (!name) return null
  const score = Number(row.score)
  if (!Number.isFinite(score)) return null
  return makeEntry({
    name,
    score,
    survivalTime: Number(row.survivalTime),
    waveStage: Number(row.waveStage),
    victory: row.victory === true || row.victory === 'true',
    recordedAt: Number(row.recordedAt),
  })
}

/** Accept a whole board from the sheet, dropping the rows that do not parse. */
export function parseEntries(raw: unknown): LeaderboardEntry[] {
  if (!Array.isArray(raw)) return []
  const parsed: LeaderboardEntry[] = []
  for (const row of raw) {
    const entry = parseEntry(row)
    if (entry) parsed.push(entry)
  }
  return parsed
}

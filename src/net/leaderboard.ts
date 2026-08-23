/**
 * The ranking board's transport: a Google Sheet, reached through Apps Script.
 *
 * The game is a static build with no server of its own, so the board needs a
 * backend that a static page may talk to without shipping a credential. A
 * Google Apps Script Web App bound to the sheet is exactly that: the script
 * runs as the sheet's owner, the page holds nothing but a public URL, and the
 * owner can read the results in a spreadsheet rather than a database. The
 * script itself lives in `google-apps-script/Code.gs`, and README explains how
 * to deploy it.
 *
 * Two details of that platform shape the requests below and are not free
 * choices:
 *
 * 1. **No preflight.** Apps Script does not answer `OPTIONS`, so any request
 *    that would trigger a CORS preflight fails before it is sent. Submits
 *    therefore post JSON under `text/plain`, which keeps them a "simple"
 *    request; `doPost` reads the body out of `e.postData.contents` regardless
 *    of the declared type.
 * 2. **A redirect on every call.** The Web App answers with a 302 to
 *    `script.googleusercontent.com`, and `fetch` follows it. That is why the
 *    result of a submit cannot be trusted to arrive - the write may well have
 *    landed even when the response did not - and why a failed submit reports
 *    the failure instead of retrying into a duplicate row.
 *
 * When no endpoint is configured, or when the network refuses, the board falls
 * back to this browser's own storage. That is not a real leaderboard and the UI
 * says so, but it keeps the whole feature playable in development and offline
 * rather than leaving a dead button on the results screen.
 */
import {
  LEADERBOARD_LIMIT,
  type LeaderboardEntry,
  type RankedEntry,
  insertEntry,
  parseEntries,
  rankEntries,
} from '../core/leaderboard'

/** Where local records go when there is no sheet to send them to. */
const LOCAL_STORAGE_KEY = 'ufo-attack-leaderboard'
/** The last name the player signed with, so a replay is one tap shorter. */
const NAME_STORAGE_KEY = 'ufo-attack-player-name'

/**
 * How long to wait before giving up on the sheet.
 *
 * Short on purpose. The player is sitting on the results screen waiting to see
 * their rank, and a board that takes eight seconds to appear reads as broken;
 * falling back to the local board quickly is the kinder failure.
 */
const REQUEST_TIMEOUT_MS = 6000

/** `'remote'` means the sheet answered. `'local'` means only this browser saw it. */
export type LeaderboardSource = 'remote' | 'local'

export type LeaderboardResult = {
  entries: RankedEntry[]
  source: LeaderboardSource
  /** Where the just-submitted record landed, when this is a submit result. */
  rank: number | null
}

/** Just enough of the DOM Storage interface for this module and its tests. */
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export type LeaderboardClientOptions = {
  /** The deployed Apps Script Web App URL. Empty means local-only. */
  endpoint: string
  fetchImpl?: typeof fetch | null
  storage?: StorageLike | null
  timeoutMs?: number
}

function safeStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    // Private-mode browsers throw on the property itself, not just on access.
    return null
  }
}

export function createLeaderboardClient(options: LeaderboardClientOptions) {
  const endpoint = options.endpoint.trim()
  const storage = options.storage === undefined ? safeStorage() : options.storage
  const fetchImpl = options.fetchImpl === undefined
    ? (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
    : options.fetchImpl
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  const configured = endpoint.length > 0 && fetchImpl !== null

  const readLocal = (): LeaderboardEntry[] => {
    if (!storage) return []
    try {
      return parseEntries(JSON.parse(storage.getItem(LOCAL_STORAGE_KEY) ?? '[]'))
    } catch {
      // A corrupted blob is worth less than an empty board is worth keeping.
      return []
    }
  }

  const writeLocal = (entries: readonly LeaderboardEntry[]) => {
    if (!storage) return
    try {
      storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries.slice(0, LEADERBOARD_LIMIT)))
    } catch {
      // Out of quota, or storage disabled. The board on screen is still right.
    }
  }

  const request = async (init: RequestInit & { url: string }): Promise<unknown> => {
    if (!fetchImpl) throw new Error('fetch unavailable')
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
    try {
      const response = await fetchImpl(init.url, {
        method: init.method,
        body: init.body,
        headers: init.headers,
        // Apps Script answers with a redirect to its content host on every
        // call, so following redirects is required rather than optional.
        redirect: 'follow',
        signal: controller?.signal,
      })
      if (!response.ok) throw new Error(`leaderboard responded ${response.status}`)
      return await response.json()
    } finally {
      if (timer !== null) clearTimeout(timer)
    }
  }

  const entriesFrom = (payload: unknown): LeaderboardEntry[] => {
    if (typeof payload !== 'object' || payload === null) return []
    const body = payload as { ok?: unknown; entries?: unknown }
    if (body.ok === false) throw new Error('leaderboard rejected the request')
    return parseEntries(body.entries)
  }

  return {
    /** Whether a sheet is wired up. The UI uses this to explain a local board. */
    get configured() {
      return configured
    },

    /** The name this browser signed with last time, for the form's initial value. */
    readStoredName(): string {
      if (!storage) return ''
      try {
        return storage.getItem(NAME_STORAGE_KEY) ?? ''
      } catch {
        return ''
      }
    },

    storeName(name: string) {
      if (!storage) return
      try {
        storage.setItem(NAME_STORAGE_KEY, name)
      } catch {
        // Losing the convenience is not worth failing the submit.
      }
    },

    /** Read the board. Never rejects - a failed read shows the local board. */
    async load(limit = LEADERBOARD_LIMIT): Promise<LeaderboardResult> {
      if (configured) {
        try {
          const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}limit=${limit}`
          const entries = entriesFrom(await request({ url, method: 'GET' }))
          return { entries: rankEntries(entries, limit), source: 'remote', rank: null }
        } catch {
          // Fall through to the local board rather than showing an error for a
          // read the player did not explicitly ask for.
        }
      }
      return { entries: rankEntries(readLocal(), limit), source: 'local', rank: null }
    },

    /**
     * Write one record.
     *
     * Rejects when the sheet is configured but unreachable, because a submit is
     * a thing the player pressed a button for and silently demoting it to a
     * local-only save would tell them their score is on the board when it is
     * not. Without a configured sheet it resolves against local storage, which
     * the caller labels as such.
     */
    async submit(entry: LeaderboardEntry, limit = LEADERBOARD_LIMIT): Promise<LeaderboardResult> {
      if (configured) {
        const payload = await request({
          url: endpoint,
          method: 'POST',
          // Not a lie the server has to unpick: Apps Script reads the raw body
          // either way, and `text/plain` is what keeps this preflight-free.
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ ...entry, limit }),
        })
        const entries = rankEntries(entriesFrom(payload), limit)
        const reported = (payload as { rank?: unknown }).rank
        const rank = typeof reported === 'number' && Number.isFinite(reported)
          ? reported
          : entries.find((row) => row.recordedAt === entry.recordedAt && row.name === entry.name)?.rank ?? null
        return { entries, source: 'remote', rank }
      }
      const entries = insertEntry(readLocal(), entry, limit)
      writeLocal(entries)
      const rank = entries.find((row) => row.recordedAt === entry.recordedAt && row.name === entry.name)?.rank ?? null
      return { entries, source: 'local', rank }
    },
  }
}

export type LeaderboardClient = ReturnType<typeof createLeaderboardClient>

/**
 * The client the game uses.
 *
 * The endpoint is a build-time variable rather than something typed in at run
 * time: it is public by design (the Apps Script deployment is what enforces
 * access, not secrecy of its URL), and baking it in means the board works for
 * every player without a setup step.
 */
export const leaderboard: LeaderboardClient = createLeaderboardClient({
  endpoint: import.meta.env.VITE_LEADERBOARD_URL ?? '',
})

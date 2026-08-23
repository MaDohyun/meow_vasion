import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Playback requests are promises, and a browser can settle one long after the
 * screen that asked for it is gone. These tests drive that gap directly: the
 * lobby asks, the request is refused or left hanging, the player starts a run,
 * and only then does the original request come back with an answer.
 */
class FakeAudio {
  static instances: FakeAudio[] = []
  src: string
  volume = 1
  muted = false
  loop = false
  autoplay = false
  preload = ''
  currentTime = 0
  readyState = 0
  paused = true
  playCount = 0
  private pending: { resolve: () => void; reject: (error: Error) => void }[] = []
  private listeners = new Map<string, Set<() => void>>()

  constructor(src: string) {
    this.src = src
    FakeAudio.instances.push(this)
  }

  setAttribute() {}

  addEventListener(type: string, listener: () => void) {
    const bucket = this.listeners.get(type) ?? new Set()
    bucket.add(listener)
    this.listeners.set(type, bucket)
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener)
  }

  load() {
    this.readyState = 1
  }

  play() {
    this.playCount += 1
    return new Promise<void>((resolve, reject) => {
      this.pending.push({ resolve, reject })
    })
  }

  pause() {
    const wasPlaying = !this.paused
    this.paused = true
    if (wasPlaying) this.emit('pause')
  }

  /** The browser grants the outstanding request and starts the track. */
  grant() {
    this.paused = false
    for (const request of this.pending.splice(0)) request.resolve()
  }

  /** The browser refuses it under the autoplay policy. */
  refuse() {
    for (const request of this.pending.splice(0)) request.reject(new Error('NotAllowedError'))
  }

  /** A pause() interrupted the request before playback began. */
  abort() {
    for (const request of this.pending.splice(0)) request.reject(new Error('AbortError'))
  }

  private emit(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener()
  }
}

type Listeners = Map<string, Set<(event?: unknown) => void>>

function makeEventTarget() {
  const listeners: Listeners = new Map()
  return {
    listeners,
    addEventListener(type: string, listener: (event?: unknown) => void) {
      const bucket = listeners.get(type) ?? new Set()
      bucket.add(listener)
      listeners.set(type, bucket)
    },
    removeEventListener(type: string, listener: (event?: unknown) => void) {
      listeners.get(type)?.delete(listener)
    },
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

let fakeWindow: ReturnType<typeof makeEventTarget>

function fire(type: string, event: Record<string, unknown> = {}) {
  for (const listener of [...(fakeWindow.listeners.get(type) ?? [])]) listener({ type, ...event })
}

const click = () => fire('click')

/** A touch that landed on scenery, and one that landed on a lobby button. */
const touchScenery = () => fire('touchend', { target: { closest: () => null } })
const touchControl = () => fire('touchend', { target: { closest: () => ({}) } })

function lobbyElement() {
  const track = FakeAudio.instances.find((instance) => instance.src.includes('lobby-bgm'))
  if (!track) throw new Error('lobby track was never created')
  return track
}

function gameplayElement() {
  const track = FakeAudio.instances.find((instance) => instance.src.includes('gameplay-bgm'))
  if (!track) throw new Error('gameplay track was never created')
  return track
}

async function loadAudio() {
  vi.resetModules()
  FakeAudio.instances = []
  fakeWindow = makeEventTarget()
  const fakeDocument = { ...makeEventTarget(), visibilityState: 'visible' }
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('window', fakeWindow)
  vi.stubGlobal('document', fakeDocument)
  return import('../src/audio')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('background music ownership', () => {
  let audio: Awaited<ReturnType<typeof loadAudio>>

  beforeEach(async () => {
    audio = await loadAudio()
  })

  /** Open the lobby on a browser that refuses sound but permits muted
   * playback - phones, and any desktop tab the player has not touched yet. */
  async function openBlockedLobby() {
    audio.startLobbyMusic()
    const lobby = lobbyElement()
    lobby.refuse()
    await flush()
    // The refusal is answered by a silent priming pass, which browsers allow.
    lobby.grant()
    await flush()
    return lobby
  }

  it('runs a refused lobby track in silence so a gesture only has to unmute it', async () => {
    const lobby = await openBlockedLobby()
    expect(lobby.paused).toBe(false)
    expect(lobby.muted).toBe(true)
    expect(audio.isLobbyMusicBlocked()).toBe(true)

    // The silent pass has been running for a while; being heard starts the
    // loop at the top rather than dropping the player into the middle of it.
    lobby.currentTime = 12
    click()
    expect(lobby.muted).toBe(false)
    expect(lobby.currentTime).toBe(0)

    lobby.grant()
    await flush()
    expect(audio.isLobbyMusicBlocked()).toBe(false)
  })

  it('keeps asking until a gesture is granted, then stops asking', async () => {
    const lobby = await openBlockedLobby()
    const primed = lobby.playCount

    // A gesture the browser refuses again leaves the retry armed.
    click()
    lobby.refuse()
    await flush()
    lobby.grant()
    await flush()
    expect(lobby.playCount).toBe(primed + 2)

    click()
    lobby.grant()
    await flush()
    const heard = lobby.playCount
    // Now that it is audible there is nothing left to retry.
    click()
    expect(lobby.playCount).toBe(heard)
  })

  it('accepts a touch on lobby scenery, where mobile browsers withhold the click', async () => {
    const lobby = await openBlockedLobby()
    const primed = lobby.playCount

    // A touch on a button is answered by the click that follows it, so only
    // the scenery touch has to stand in for one.
    touchControl()
    expect(lobby.playCount).toBe(primed)
    touchScenery()
    expect(lobby.playCount).toBe(primed + 1)
  })

  it('does not let a refused lobby request restart itself under the gameplay track', async () => {
    const lobby = await openBlockedLobby()

    // The player's first tap is Start: the lobby retry goes out, and the run
    // begins while the browser is still deciding.
    click()
    const asked = lobby.playCount
    audio.startGameplayMusic()
    // Pausing the lobby aborted its request; the rejection is not a fresh
    // autoplay refusal and must not be retried.
    lobby.abort()
    await flush()

    expect(audio.activeMusicTrack()).toBe('gameplay')
    expect(lobby.paused).toBe(true)
    expect(lobby.playCount).toBe(asked)
    expect(audio.isLobbyMusicBlocked()).toBe(false)

    gameplayElement().grant()
    await flush()
    expect(gameplayElement().paused).toBe(false)
    expect(lobby.paused).toBe(true)
  })

  it('silences a lobby request that the browser grants after the run started', async () => {
    audio.startLobbyMusic()
    const lobby = lobbyElement()
    audio.startGameplayMusic()
    // The browser gets around to the lobby request only now.
    lobby.grant()
    await flush()

    expect(lobby.paused).toBe(true)
    expect(lobby.currentTime).toBe(0)
    expect(audio.activeMusicTrack()).toBe('gameplay')
  })

  it('ignores lobby gestures once the game owns the mix', async () => {
    const lobby = await openBlockedLobby()
    audio.startGameplayMusic()
    lobby.abort()
    await flush()
    const stopped = lobby.playCount

    click()
    touchScenery()
    expect(lobby.playCount).toBe(stopped)
    expect(lobby.paused).toBe(true)
  })

  it('hands the mix back when the lobby returns', async () => {
    audio.startGameplayMusic()
    const gameplay = gameplayElement()
    gameplay.grant()
    await flush()

    audio.startLobbyMusic()
    expect(audio.activeMusicTrack()).toBe('lobby')
    expect(gameplay.paused).toBe(true)
    expect(lobbyElement().playCount).toBe(1)
  })

  it('reports silence once both tracks are stopped', async () => {
    audio.startLobbyMusic()
    audio.stopLobbyMusic()
    expect(audio.activeMusicTrack()).toBe(null)
    audio.startGameplayMusic()
    audio.stopGameplayMusic()
    expect(audio.activeMusicTrack()).toBe(null)
    expect(gameplayElement().paused).toBe(true)
  })
})

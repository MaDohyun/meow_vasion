let context: AudioContext | null = null
let laserBuffer: AudioBuffer | null = null
let laserLoad: Promise<AudioBuffer | null> | null = null
let laserPlaybackQueued = false
let laserLoadFailed = false
let lobbyMusic: HTMLAudioElement | null = null
let gameplayMusic: HTMLAudioElement | null = null
let beamSound: HTMLAudioElement | null = null
let boosterSound: HTMLAudioElement | null = null
let gameplayFadeFrame: number | null = null

const GAMEPLAY_MUSIC_START_VOLUME = 0.025
const GAMEPLAY_MUSIC_MAX_VOLUME = 0.18
const GAMEPLAY_MUSIC_FADE_SECONDS = 8

/**
 * Supplied looping tracks live separately from the Web Audio effects, so the
 * scene can change music without interrupting active laser and impact sounds.
 */
export const BGM_BASE_TEMPO = 164

export function bgmTempoForWave(wave: number) {
  return BGM_BASE_TEMPO + Math.max(0, Math.min(7, Math.round(wave))) * 5
}

function lobbyTrack() {
  if (typeof Audio === 'undefined') return null
  if (!lobbyMusic) {
    lobbyMusic = new Audio('/audio/lobby-bgm.mp3')
    lobbyMusic.loop = true
    lobbyMusic.preload = 'auto'
    lobbyMusic.volume = 0.28
  }
  return lobbyMusic
}

function gameplayTrack() {
  if (typeof Audio === 'undefined') return null
  if (!gameplayMusic) {
    gameplayMusic = new Audio('/audio/gameplay-bgm.mp3')
    gameplayMusic.loop = true
    gameplayMusic.preload = 'auto'
  }
  return gameplayMusic
}

function beamTrack() {
  if (typeof Audio === 'undefined') return null
  if (!beamSound) {
    beamSound = new Audio('/audio/ufo-beam.mp3')
    beamSound.loop = true
    beamSound.preload = 'auto'
    beamSound.volume = 0.2
  }
  return beamSound
}

function boosterTrack() {
  if (typeof Audio === 'undefined') return null
  if (!boosterSound) {
    boosterSound = new Audio('/audio/ufo-booster.wav')
    boosterSound.loop = false
    boosterSound.preload = 'auto'
    boosterSound.volume = 0.4
  }
  return boosterSound
}

/** Best effort on initial load; browsers that block autoplay retry on the
 * player's first lobby interaction (wired from the intro screen). */
export function startLobbyMusic() {
  const track = lobbyTrack()
  if (!track) return
  void track.play().catch(() => undefined)
}

export function stopLobbyMusic() {
  if (!lobbyMusic) return
  lobbyMusic.pause()
  lobbyMusic.currentTime = 0
}

/** Start very quietly, then settle under the effects mix during active play. */
export function startGameplayMusic() {
  const track = gameplayTrack()
  if (!track) return
  if (gameplayFadeFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(gameplayFadeFrame)
  }
  gameplayFadeFrame = null
  track.volume = GAMEPLAY_MUSIC_START_VOLUME
  void track.play().catch(() => undefined)

  if (typeof requestAnimationFrame === 'undefined') {
    track.volume = GAMEPLAY_MUSIC_MAX_VOLUME
    return
  }
  const beganAt = performance.now()
  const fade = (now: number) => {
    const progress = Math.min(1, (now - beganAt) / (GAMEPLAY_MUSIC_FADE_SECONDS * 1000))
    track.volume = GAMEPLAY_MUSIC_START_VOLUME
      + (GAMEPLAY_MUSIC_MAX_VOLUME - GAMEPLAY_MUSIC_START_VOLUME) * progress
    if (progress < 1) gameplayFadeFrame = requestAnimationFrame(fade)
    else gameplayFadeFrame = null
  }
  gameplayFadeFrame = requestAnimationFrame(fade)
}

export function stopGameplayMusic() {
  if (gameplayFadeFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(gameplayFadeFrame)
  }
  gameplayFadeFrame = null
  if (!gameplayMusic) return
  gameplayMusic.pause()
  gameplayMusic.currentTime = 0
}

/** Loop the supplied beam sample for exactly as long as the tractor beam is held. */
export function startBeamSound() {
  const track = beamTrack()
  if (!track || !track.paused) return
  track.currentTime = 0
  void track.play().catch(() => undefined)
}

export function stopBeamSound() {
  if (!beamSound) return
  beamSound.pause()
  beamSound.currentTime = 0
}

/** Play the booster sample once for each fresh boost activation. */
export function playBoosterSound() {
  const track = boosterTrack()
  if (!track) return
  track.currentTime = 0
  void track.play().catch(() => undefined)
}

export function unlockAudio() {
  if (!context) context = new AudioContext()
  if (context.state === 'suspended') void context.resume()
  void loadLaserSound()
}

/** Load the supplied laser sample once, then fan out short overlapping buffer
 * sources so rapid fire does not cut the previous shot off. */
function loadLaserSound() {
  if (!context || laserBuffer || laserLoadFailed) return Promise.resolve(laserBuffer)
  if (laserLoad) return laserLoad
  laserLoad = fetch('/audio/ufo-laser.wav')
    .then((response) => response.arrayBuffer())
    .then((data) => context ? context.decodeAudioData(data) : null)
    .then((buffer) => {
      laserBuffer = buffer
      return buffer
    })
    .catch(() => {
      laserLoadFailed = true
      return null
    })
  return laserLoad
}

export function playLaserSound() {
  if (!context || context.state !== 'running' || laserLoadFailed) return
  if (!laserBuffer) {
    if (laserPlaybackQueued) return
    laserPlaybackQueued = true
    void loadLaserSound().then(() => {
      laserPlaybackQueued = false
      playLaserSound()
    })
    return
  }
  const source = context.createBufferSource()
  const gain = context.createGain()
  source.buffer = laserBuffer
  // Laser sits above the deliberately restrained music bed, while still
  // leaving enough headroom for rapid-fire overlap.
  gain.gain.setValueAtTime(0.92, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + Math.min(0.42, laserBuffer.duration))
  source.connect(gain)
  gain.connect(context.destination)
  source.start()
}

export function tone(kind: 'pickup' | 'delivery' | 'warning' | 'impact' | 'upgrade') {
  if (!context || context.state !== 'running') return
  const now = context.currentTime
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const frequencies = {
    pickup: [420, 760],
    delivery: [520, 980],
    warning: [210, 170],
    impact: [95, 55],
    upgrade: [600, 1180],
  } as const
  oscillator.type = kind === 'impact' ? 'sawtooth' : kind === 'warning' ? 'square' : 'triangle'
  oscillator.frequency.setValueAtTime(frequencies[kind][0], now)
  oscillator.frequency.exponentialRampToValueAtTime(frequencies[kind][1], now + 0.12)
  gain.gain.setValueAtTime(kind === 'impact' ? 0.11 : 0.07, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.19)
}

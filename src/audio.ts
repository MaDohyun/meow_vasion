let context: AudioContext | null = null
let laserBuffer: AudioBuffer | null = null
let laserLoad: Promise<AudioBuffer | null> | null = null
let laserPlaybackQueued = false
let laserLoadFailed = false
let droneExplosionBuffer: AudioBuffer | null = null
let droneExplosionLoad: Promise<AudioBuffer | null> | null = null
let droneExplosionPlaybackQueued = false
let droneExplosionLoadFailed = false
let buildingCollapseBuffer: AudioBuffer | null = null
let buildingCollapseLoad: Promise<AudioBuffer | null> | null = null
let buildingCollapsePlaybackQueued = false
let buildingCollapseLoadFailed = false
let vehicleExplosionBuffer: AudioBuffer | null = null
let vehicleExplosionLoad: Promise<AudioBuffer | null> | null = null
let vehicleExplosionPlaybackQueued = false
let vehicleExplosionLoadFailed = false
let lobbyMusic: HTMLAudioElement | null = null
let gameplayMusic: HTMLAudioElement | null = null
let beamSound: HTMLAudioElement | null = null
let boosterSound: HTMLAudioElement | null = null
let mysteryCircleSound: HTMLAudioElement | null = null
let nearbyCatCrySound: HTMLAudioElement | null = null
let menuHoverSound: HTMLAudioElement | null = null
let gameplayFadeFrame: number | null = null
let effectsMasterGain: GainNode | null = null

const LOBBY_MUSIC_VOLUME = 0.28
const GAMEPLAY_MUSIC_START_VOLUME = 0.025
const GAMEPLAY_MUSIC_MAX_VOLUME = 0.18
const GAMEPLAY_MUSIC_FADE_SECONDS = 8
const BEAM_VOLUME = 0.2
const BOOSTER_VOLUME = 0.4
const MYSTERY_CIRCLE_VOLUME = 0.7
const CAT_CRY_VOLUME = 0.62
const MENU_HOVER_VOLUME = 0.1
/** A car or box truck going up. A third as loud as the blast first shipped at,
 * measured by ear rather than by the number: the sample was swapped at the
 * same time for one that is about 3dB hotter, so a plain 0.6/3 would have
 * landed near half. 0.14 is what actually puts it a third of the way down, and
 * well under the drone and building blasts it has to share a street with. */
const VEHICLE_EXPLOSION_VOLUME = 0.14
/** A tanker is a fuel load, not sheet metal. Same sample, played harder so the
 * rarest and highest-scoring kill in the city is the one that is heard. */
export const TANKER_EXPLOSION_SCALE = 1.55
const BGM_VOLUME_STORAGE_KEY = 'beam-bandit-bgm-volume'
const SFX_VOLUME_STORAGE_KEY = 'beam-bandit-sfx-volume'

function clampVolume(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
}

function storedVolume(key: string) {
  if (typeof window === 'undefined') return 1
  try {
    const stored = window.localStorage.getItem(key)
    return stored === null ? 1 : clampVolume(Number(stored))
  } catch {
    return 1
  }
}

function storeVolume(key: string, value: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // Audio still works when storage is unavailable (for example, privacy mode).
  }
}

let bgmVolume = storedVolume(BGM_VOLUME_STORAGE_KEY)
let sfxVolume = storedVolume(SFX_VOLUME_STORAGE_KEY)
let gameplayMusicBaseVolume = GAMEPLAY_MUSIC_START_VOLUME

export type AudioVolumes = {
  bgm: number
  sfx: number
}

export function getAudioVolumes(): AudioVolumes {
  return { bgm: bgmVolume, sfx: sfxVolume }
}

export function setBgmVolume(value: number) {
  bgmVolume = clampVolume(value)
  storeVolume(BGM_VOLUME_STORAGE_KEY, bgmVolume)
  if (lobbyMusic) lobbyMusic.volume = LOBBY_MUSIC_VOLUME * bgmVolume
  if (gameplayMusic) gameplayMusic.volume = gameplayMusicBaseVolume * bgmVolume
}

export function setSfxVolume(value: number) {
  sfxVolume = clampVolume(value)
  storeVolume(SFX_VOLUME_STORAGE_KEY, sfxVolume)
  if (beamSound) beamSound.volume = BEAM_VOLUME * sfxVolume
  if (boosterSound) boosterSound.volume = BOOSTER_VOLUME * sfxVolume
  if (mysteryCircleSound) mysteryCircleSound.volume = MYSTERY_CIRCLE_VOLUME * sfxVolume
  if (nearbyCatCrySound) nearbyCatCrySound.volume = CAT_CRY_VOLUME * sfxVolume
  if (menuHoverSound) menuHoverSound.volume = MENU_HOVER_VOLUME * sfxVolume
  if (context && effectsMasterGain) {
    effectsMasterGain.gain.setValueAtTime(sfxVolume, context.currentTime)
  }
}

function effectsDestination() {
  if (!context) return null
  if (!effectsMasterGain) {
    effectsMasterGain = context.createGain()
    effectsMasterGain.gain.setValueAtTime(sfxVolume, context.currentTime)
    effectsMasterGain.connect(context.destination)
  }
  return effectsMasterGain
}

/**
 * Supplied looping tracks live separately from the Web Audio effects, so the
 * scene can change music without interrupting active laser and impact sounds.
 */
export const BGM_BASE_TEMPO = 164

export function bgmTempoForWave(wave: number) {
  return BGM_BASE_TEMPO + Math.max(0, Math.min(7, Math.round(wave))) * 5
}

/**
 * Exactly one background track may own the mix. Playback requests are
 * asynchronous - a `play()` promise can settle long after the scene that asked
 * for it is gone, and on mobile that gap is wide enough for a blocked lobby
 * track to wake up underneath the gameplay track. Every deferred playback path
 * re-reads this owner (and the generation it was issued under) before it is
 * allowed to make a sound, so a late arrival stops itself instead of layering.
 */
type MusicTrack = 'lobby' | 'gameplay'
let activeMusic: MusicTrack | null = null
let musicGeneration = 0
let lobbyUnlockBound = false
let lobbyBlocked = false
const lobbyBlockedListeners = new Set<() => void>()

/** Which background track currently owns the mix, or null in silence. */
export function activeMusicTrack(): MusicTrack | null {
  return activeMusic
}

/** True while the lobby track is running but silenced by the browser, waiting
 * for a gesture. The lobby shows a way to grant it rather than leaving the
 * player wondering where the music went. */
export function isLobbyMusicBlocked() {
  return lobbyBlocked
}

export function onLobbyMusicBlockedChange(listener: () => void) {
  lobbyBlockedListeners.add(listener)
  return () => { lobbyBlockedListeners.delete(listener) }
}

function setLobbyBlocked(next: boolean) {
  if (lobbyBlocked === next) return
  lobbyBlocked = next
  for (const listener of [...lobbyBlockedListeners]) listener()
}

function lobbyTrack() {
  if (typeof Audio === 'undefined') return null
  if (!lobbyMusic) {
    lobbyMusic = new Audio('/audio/lobby-bgm.mp3')
    // Ask the browser to begin the lobby track as soon as the intro is
    // mounted. `play()` is still called explicitly below because some
    // browsers only honour the autoplay hint after the media is loaded.
    lobbyMusic.autoplay = true
    lobbyMusic.setAttribute('playsinline', 'true')
    lobbyMusic.loop = true
    lobbyMusic.preload = 'auto'
    lobbyMusic.volume = LOBBY_MUSIC_VOLUME * bgmVolume
    lobbyMusic.addEventListener('pause', handleLobbyPause)
  }
  return lobbyMusic
}

/** Browsers pause a track that was unmuted without permission, and phones
 * pause everything when the page goes to the background. While the lobby still
 * owns the mix, either is a reason to start asking again. `stopLobbyMusic`
 * gives the mix up before it pauses, so its own pause never lands here. */
function handleLobbyPause() {
  if (activeMusic !== 'lobby') return
  setLobbyBlocked(true)
  bindLobbyUnlock()
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
    beamSound.volume = BEAM_VOLUME * sfxVolume
  }
  return beamSound
}

function boosterTrack() {
  if (typeof Audio === 'undefined') return null
  if (!boosterSound) {
    boosterSound = new Audio('/audio/ufo-booster.wav')
    boosterSound.loop = false
    boosterSound.preload = 'auto'
    boosterSound.volume = BOOSTER_VOLUME * sfxVolume
  }
  return boosterSound
}

function mysteryCircleTrack() {
  if (typeof Audio === 'undefined') return null
  if (!mysteryCircleSound) {
    mysteryCircleSound = new Audio('/audio/mystery-circle.wav')
    mysteryCircleSound.loop = false
    mysteryCircleSound.preload = 'auto'
    mysteryCircleSound.volume = MYSTERY_CIRCLE_VOLUME * sfxVolume
  }
  return mysteryCircleSound
}

function nearbyCatCryTrack() {
  if (typeof Audio === 'undefined') return null
  if (!nearbyCatCrySound) {
    nearbyCatCrySound = new Audio('/audio/cat-cry.wav')
    nearbyCatCrySound.loop = false
    nearbyCatCrySound.preload = 'auto'
    nearbyCatCrySound.volume = CAT_CRY_VOLUME * sfxVolume
  }
  return nearbyCatCrySound
}

function menuHoverTrack() {
  if (typeof Audio === 'undefined') return null
  if (!menuHoverSound) {
    menuHoverSound = new Audio('/audio/menu-hover.wav')
    menuHoverSound.loop = false
    menuHoverSound.preload = 'auto'
    menuHoverSound.volume = MENU_HOVER_VOLUME * sfxVolume
  }
  return menuHoverSound
}

/* Autoplay is refused until the browser has seen a real gesture, so the lobby
 * keeps asking. `click` and `keyup` are deliberate: they arrive *after* the
 * interface has handled the same interaction, so tapping Start never fires one
 * more lobby request on the way into the game. `touchend` is the exception
 * mobile Safari forces - it withholds `click` from plain scenery - so it is
 * accepted only for touches that landed outside a control. */
const LOBBY_UNLOCK_EVENTS = ['click', 'keyup', 'touchend'] as const
const LOBBY_CONTROL_SELECTOR = 'button, a, input, select, [role="button"]'

function touchedAControl(event?: Event) {
  const target = event?.target as Element | null
  if (!target || typeof target.closest !== 'function') return false
  return target.closest(LOBBY_CONTROL_SELECTOR) !== null
}

function bindLobbyUnlock() {
  if (typeof window === 'undefined' || lobbyUnlockBound) return
  lobbyUnlockBound = true
  for (const type of LOBBY_UNLOCK_EVENTS) window.addEventListener(type, retryLobbyMusic)
  // Mobile browsers pause media when the page goes to the background and
  // refuse to resume it while hidden; coming back is another chance to start.
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', retryLobbyMusic)
}

function releaseLobbyUnlock() {
  if (typeof window === 'undefined' || !lobbyUnlockBound) return
  lobbyUnlockBound = false
  for (const type of LOBBY_UNLOCK_EVENTS) window.removeEventListener(type, retryLobbyMusic)
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', retryLobbyMusic)
}

function retryLobbyMusic(event?: Event) {
  if (activeMusic !== 'lobby') {
    releaseLobbyUnlock()
    return
  }
  if (lobbyIsAudible()) {
    releaseLobbyUnlock()
    return
  }
  // A touch on a control is followed by the click the interface acts on. Let
  // that click decide, so pressing Start never asks for the lobby track on the
  // way into a run.
  if (event?.type === 'touchend' && touchedAControl(event)) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  requestLobbyPlayback()
}

/** Running is not the same as heard: a track primed in silence is playing and
 * still needs a gesture before anyone can listen to it. */
function lobbyIsAudible() {
  return !!lobbyMusic && !lobbyMusic.paused && !lobbyMusic.muted
}

function ownsMix(generation: number) {
  return generation === musicGeneration && activeMusic === 'lobby'
}

function silenceLobby() {
  if (!lobbyMusic) return
  lobbyMusic.pause()
  lobbyMusic.currentTime = 0
}

/** Ask for the lobby track with sound. */
function requestLobbyPlayback() {
  const track = lobbyTrack()
  if (!track) return
  // A track primed in silence rewinds the moment it is allowed to be heard,
  // so the loop is never joined halfway through.
  if (track.muted) track.currentTime = 0
  track.muted = false
  track.autoplay = true
  track.volume = LOBBY_MUSIC_VOLUME * bgmVolume
  // A newly-created element may not have started fetching yet. Nudge it only
  // while nothing has arrived, so a retry never restarts an in-flight fetch.
  if (track.readyState === 0) track.load()
  const generation = musicGeneration
  void Promise.resolve(track.play()).then(() => {
    if (!ownsMix(generation)) {
      // The player reached Start while this request was still in flight. The
      // gameplay track owns the mix now, so this one bows out silently.
      silenceLobby()
      return
    }
    setLobbyBlocked(false)
    releaseLobbyUnlock()
  }).catch(() => {
    // Refused by autoplay policy, or aborted by our own stop. Recovering is
    // only ever right in the first case, which is exactly when the lobby still
    // owns the mix under the same generation.
    if (!ownsMix(generation)) return
    bindLobbyUnlock()
    primeLobbyPlayback(generation)
  })
}

/** Sound was refused, but muted playback is permitted with no gesture at all.
 * Run the track silently so it is buffered and already rolling: the first
 * gesture then has nothing to do but unmute it. Unmuting is deliberately left
 * to that gesture - doing it on our own is what browsers punish, and what used
 * to leave the lobby track singing underneath the gameplay track. */
function primeLobbyPlayback(generation: number) {
  const track = lobbyMusic
  if (!track) return
  track.muted = true
  void Promise.resolve(track.play()).then(() => {
    if (!ownsMix(generation)) silenceLobby()
    else setLobbyBlocked(true)
  }).catch(() => {
    if (ownsMix(generation)) setLobbyBlocked(true)
  })
}

/** Start as soon as the lobby is mounted, and keep trying from real gestures
 * for as long as the lobby is the track that should be playing. */
export function startLobbyMusic() {
  const track = lobbyTrack()
  if (!track) return
  if (activeMusic !== 'lobby') {
    stopGameplayMusic()
    activeMusic = 'lobby'
    musicGeneration += 1
  }
  bindLobbyUnlock()
  requestLobbyPlayback()
}

export function stopLobbyMusic() {
  if (activeMusic === 'lobby') {
    activeMusic = null
    // Invalidate any request still in flight so it cannot resume behind us.
    musicGeneration += 1
  }
  releaseLobbyUnlock()
  setLobbyBlocked(false)
  if (!lobbyMusic) return
  // Clearing the hint keeps a late-arriving buffer from starting the track on
  // the browser's own initiative once we have paused it.
  lobbyMusic.autoplay = false
  lobbyMusic.muted = false
  lobbyMusic.pause()
  lobbyMusic.currentTime = 0
}

/** Start very quietly, then settle under the effects mix during active play. */
export function startGameplayMusic() {
  // Handing the mix over is the same act as taking the lobby track off it.
  stopLobbyMusic()
  const track = gameplayTrack()
  if (!track) return
  if (gameplayFadeFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(gameplayFadeFrame)
  }
  gameplayFadeFrame = null
  activeMusic = 'gameplay'
  musicGeneration += 1
  const generation = musicGeneration
  gameplayMusicBaseVolume = GAMEPLAY_MUSIC_START_VOLUME
  track.volume = gameplayMusicBaseVolume * bgmVolume
  void Promise.resolve(track.play()).then(() => {
    if (generation === musicGeneration && activeMusic === 'gameplay') return
    // The run ended before the browser granted this request.
    track.pause()
    track.currentTime = 0
  }).catch(() => undefined)

  if (typeof requestAnimationFrame === 'undefined') {
    gameplayMusicBaseVolume = GAMEPLAY_MUSIC_MAX_VOLUME
    track.volume = gameplayMusicBaseVolume * bgmVolume
    return
  }
  const beganAt = performance.now()
  const fade = (now: number) => {
    if (generation !== musicGeneration) {
      gameplayFadeFrame = null
      return
    }
    const progress = Math.min(1, (now - beganAt) / (GAMEPLAY_MUSIC_FADE_SECONDS * 1000))
    gameplayMusicBaseVolume = GAMEPLAY_MUSIC_START_VOLUME
      + (GAMEPLAY_MUSIC_MAX_VOLUME - GAMEPLAY_MUSIC_START_VOLUME) * progress
    track.volume = gameplayMusicBaseVolume * bgmVolume
    if (progress < 1) gameplayFadeFrame = requestAnimationFrame(fade)
    else gameplayFadeFrame = null
  }
  gameplayFadeFrame = requestAnimationFrame(fade)
}

export function stopGameplayMusic() {
  if (activeMusic === 'gameplay') {
    activeMusic = null
    musicGeneration += 1
  }
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

/** Play the mystery-circle surge cue once on entry. */
export function playMysteryCircleSound() {
  const track = mysteryCircleTrack()
  if (!track) return
  track.currentTime = 0
  void track.play().catch(() => undefined)
}

/** Play a nearby-cat call on its own channel so overlapping proximity events
 * can never restart an already-playing call. */
export function playNearbyCatCrySound(volumeScale = 1) {
  const track = nearbyCatCryTrack()
  if (!track) return
  track.currentTime = 0
  track.volume = CAT_CRY_VOLUME * sfxVolume * Math.max(0.16, Math.min(1, volumeScale))
  void track.play().catch(() => undefined)
}

/** Play the supplied hover cue once each time the pointer settles on a lobby
 * menu button. A sweep across the menu restarts the cue from the top instead
 * of layering copies. Before the browser has seen a gesture the request is
 * refused - swallowing that keeps the first hover from throwing. */
export function playMenuHoverSound() {
  const track = menuHoverTrack()
  if (!track) return
  track.currentTime = 0
  void track.play().catch(() => undefined)
}

export function unlockAudio() {
  if (!context) context = new AudioContext()
  effectsDestination()
  if (context.state === 'suspended') void context.resume()
  void loadLaserSound()
  void loadDroneExplosionSound()
  void loadBuildingCollapseSound()
  void loadVehicleExplosionSound()
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
  gain.connect(effectsDestination() ?? context.destination)
  source.start()
}

/** Decode the supplied drone blast once. Buffer sources are created per event
 * so several drones can explode without cutting one another off. */
function loadDroneExplosionSound() {
  if (!context || droneExplosionBuffer || droneExplosionLoadFailed) return Promise.resolve(droneExplosionBuffer)
  if (droneExplosionLoad) return droneExplosionLoad
  droneExplosionLoad = fetch('/audio/drone-explosion.wav')
    .then((response) => response.arrayBuffer())
    .then((data) => context ? context.decodeAudioData(data) : null)
    .then((buffer) => {
      droneExplosionBuffer = buffer
      return buffer
    })
    .catch(() => {
      droneExplosionLoadFailed = true
      return null
    })
  return droneExplosionLoad
}

/** Play for every way a drone can detonate: laser kill, mine fuse or contact. */
export function playDroneExplosionSound() {
  if (!context || context.state !== 'running' || droneExplosionLoadFailed) return
  if (!droneExplosionBuffer) {
    if (droneExplosionPlaybackQueued) return
    droneExplosionPlaybackQueued = true
    void loadDroneExplosionSound().then(() => {
      droneExplosionPlaybackQueued = false
      playDroneExplosionSound()
    })
    return
  }
  const source = context.createBufferSource()
  const gain = context.createGain()
  source.buffer = droneExplosionBuffer
  // Leave headroom for rapid swarm kills; the shared effects gain applies the
  // lobby's sound-effect slider after this per-sample mix level.
  gain.gain.setValueAtTime(0.58, context.currentTime)
  source.connect(gain)
  gain.connect(effectsDestination() ?? context.destination)
  source.start()
}

/** Decode the supplied building-collapse blast once and play it only after a
 * building's destruction threshold has actually been reached. */
function loadBuildingCollapseSound() {
  if (!context || buildingCollapseBuffer || buildingCollapseLoadFailed) return Promise.resolve(buildingCollapseBuffer)
  if (buildingCollapseLoad) return buildingCollapseLoad
  buildingCollapseLoad = fetch('/audio/building-collapse.wav')
    .then((response) => response.arrayBuffer())
    .then((data) => context ? context.decodeAudioData(data) : null)
    .then((buffer) => {
      buildingCollapseBuffer = buffer
      return buffer
    })
    .catch(() => {
      buildingCollapseLoadFailed = true
      return null
    })
  return buildingCollapseLoad
}

export function playBuildingCollapseSound() {
  if (!context || context.state !== 'running' || buildingCollapseLoadFailed) return
  if (!buildingCollapseBuffer) {
    if (buildingCollapsePlaybackQueued) return
    buildingCollapsePlaybackQueued = true
    void loadBuildingCollapseSound().then(() => {
      buildingCollapsePlaybackQueued = false
      playBuildingCollapseSound()
    })
    return
  }
  const source = context.createBufferSource()
  const gain = context.createGain()
  source.buffer = buildingCollapseBuffer
  gain.gain.setValueAtTime(0.66, context.currentTime)
  source.connect(gain)
  gain.connect(effectsDestination() ?? context.destination)
  source.start()
}

/** Decode the supplied road-vehicle blast once. Every car, box truck and
 * tanker that goes up shares this one sample; only the level changes. */
function loadVehicleExplosionSound() {
  if (!context || vehicleExplosionBuffer || vehicleExplosionLoadFailed) return Promise.resolve(vehicleExplosionBuffer)
  if (vehicleExplosionLoad) return vehicleExplosionLoad
  vehicleExplosionLoad = fetch('/audio/vehicle-explosion.wav')
    .then((response) => response.arrayBuffer())
    .then((data) => context ? context.decodeAudioData(data) : null)
    .then((buffer) => {
      vehicleExplosionBuffer = buffer
      return buffer
    })
    .catch(() => {
      vehicleExplosionLoadFailed = true
      return null
    })
  return vehicleExplosionLoad
}

/**
 * Play for every road vehicle that detonates: a car launched by the laser, a
 * box truck shot out, or a tanker. `volumeScale` is what tells the three
 * apart - a tanker passes TANKER_EXPLOSION_SCALE so the heavy kill lands
 * harder than the sedan next to it. A fresh buffer source per event lets a
 * chain of kills overlap instead of cutting one another off.
 */
export function playVehicleExplosionSound(volumeScale = 1) {
  if (!context || context.state !== 'running' || vehicleExplosionLoadFailed) return
  if (!vehicleExplosionBuffer) {
    if (vehicleExplosionPlaybackQueued) return
    vehicleExplosionPlaybackQueued = true
    void loadVehicleExplosionSound().then(() => {
      vehicleExplosionPlaybackQueued = false
      playVehicleExplosionSound(volumeScale)
    })
    return
  }
  const source = context.createBufferSource()
  const gain = context.createGain()
  source.buffer = vehicleExplosionBuffer
  // The ceiling is a guard, not a working limit - at the current level even a
  // tanker lands nowhere near it. It is here so that raising either number
  // later cannot push the blast into clipping the effects bus on its way out.
  const level = Math.min(0.98, VEHICLE_EXPLOSION_VOLUME * Math.max(0, volumeScale))
  gain.gain.setValueAtTime(level, context.currentTime)
  source.connect(gain)
  gain.connect(effectsDestination() ?? context.destination)
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
  gain.connect(effectsDestination() ?? context.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.19)
}

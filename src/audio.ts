let context: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null
let bgmTimer: ReturnType<typeof setInterval> | null = null
let bgmMaster: GainNode | null = null
let bgmCompressor: DynamicsCompressorNode | null = null
let nextMusicStepTime = 0
let musicStep = 0
let musicWanted = 0

export const BGM_BASE_TEMPO = 164
const MUSIC_LOOKAHEAD = 0.32
const MUSIC_INTERVAL_MS = 80

const BASS_PATTERN = [
  36, null, 43, null, 46, null, 43, 47,
  36, null, 39, 41, 43, null, 35, 47,
] as const

const LEAD_PATTERN = [
  null, 72, null, 75, 79, null, 77, null,
  74, null, 75, 70, null, 67, null, 71,
  null, 72, 75, null, 82, 79, null, 77,
  74, 75, null, 70, 68, null, 67, 71,
] as const

export function bgmTempoForWanted(wanted: number) {
  return BGM_BASE_TEMPO + Math.max(0, Math.min(5, Math.round(wanted))) * 5
}

function midiFrequency(note: number) {
  return 440 * Math.pow(2, (note - 69) / 12)
}

export function unlockAudio() {
  if (!context) context = new AudioContext()
  if (context.state === 'suspended') void context.resume()
}

function musicNoise(ctx: AudioContext) {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer
  const length = Math.floor(ctx.sampleRate * 0.22)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const channel = buffer.getChannelData(0)
  let randomState = 0x5eeda11
  for (let index = 0; index < length; index += 1) {
    randomState ^= randomState << 13
    randomState ^= randomState >>> 17
    randomState ^= randomState << 5
    channel[index] = ((randomState >>> 0) / 0xffffffff * 2 - 1) * (1 - index / length * 0.35)
  }
  noiseBuffer = buffer
  return buffer
}

function scheduleSynth(
  time: number,
  note: number,
  duration: number,
  volume: number,
  type: OscillatorType,
  destination: AudioNode,
  slideTo?: number,
) {
  if (!context) return
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(midiFrequency(note), time)
  if (slideTo !== undefined) oscillator.frequency.exponentialRampToValueAtTime(midiFrequency(slideTo), time + duration)
  gain.gain.setValueAtTime(0.0001, time)
  gain.gain.exponentialRampToValueAtTime(volume, time + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration)
  oscillator.connect(gain)
  gain.connect(destination)
  oscillator.start(time)
  oscillator.stop(time + duration + 0.02)
}

function scheduleKick(time: number, destination: AudioNode) {
  if (!context) return
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(150, time)
  oscillator.frequency.exponentialRampToValueAtTime(46, time + 0.13)
  gain.gain.setValueAtTime(0.0001, time)
  gain.gain.exponentialRampToValueAtTime(0.34, time + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.17)
  oscillator.connect(gain)
  gain.connect(destination)
  oscillator.start(time)
  oscillator.stop(time + 0.18)
}

function scheduleNoise(time: number, duration: number, volume: number, frequency: number, destination: AudioNode) {
  if (!context) return
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  source.buffer = musicNoise(context)
  filter.type = 'highpass'
  filter.frequency.setValueAtTime(frequency, time)
  gain.gain.setValueAtTime(volume, time)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(destination)
  source.start(time)
  source.stop(time + duration)
}

function scheduleMusicStep(step: number, time: number, destination: AudioNode) {
  const localStep = step % 16
  const bassNote = BASS_PATTERN[localStep]
  const leadNote = LEAD_PATTERN[step % LEAD_PATTERN.length]

  if (localStep === 0 || localStep === 3 || localStep === 8 || localStep === 11 || (musicWanted >= 3 && localStep === 14)) {
    scheduleKick(time, destination)
  }
  if (localStep === 4 || localStep === 12) scheduleNoise(time, 0.1, 0.18, 950, destination)
  if (localStep % 2 === 0 || musicWanted >= 4) {
    scheduleNoise(time, localStep % 4 === 2 ? 0.055 : 0.032, localStep % 4 === 2 ? 0.075 : 0.048, 5400, destination)
  }
  if (bassNote !== null) scheduleSynth(time, bassNote, 0.18, 0.12, 'sawtooth', destination)
  if (leadNote !== null) scheduleSynth(time, leadNote, 0.11, 0.072, 'triangle', destination)

  if (localStep === 7) scheduleSynth(time, step % 32 < 16 ? 84 : 87, 0.12, 0.035, 'square', destination, 76)
  if (localStep === 15) scheduleSynth(time, 79, 0.16, 0.042, 'square', destination, step % 32 < 16 ? 67 : 72)
  if (musicWanted >= 2 && localStep === 10) scheduleSynth(time, 91, 0.07, 0.025, 'triangle', destination)
}

function scheduleMusic() {
  if (!context || !bgmMaster || context.state !== 'running') return
  if (nextMusicStepTime < context.currentTime - 0.1) nextMusicStepTime = context.currentTime + 0.03
  while (nextMusicStepTime < context.currentTime + MUSIC_LOOKAHEAD) {
    scheduleMusicStep(musicStep, nextMusicStepTime, bgmMaster)
    musicStep = (musicStep + 1) % LEAD_PATTERN.length
    nextMusicStepTime += 60 / bgmTempoForWanted(musicWanted) / 4
  }
}

export function startBgm() {
  unlockAudio()
  if (!context || bgmTimer) return
  if (context.state !== 'running') {
    const pendingContext = context
    void context.resume().then(() => {
      if (context === pendingContext) startBgm()
    })
    return
  }
  musicWanted = 0
  musicStep = 0
  nextMusicStepTime = context.currentTime + 0.05

  const master = context.createGain()
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.setValueAtTime(-18, context.currentTime)
  compressor.knee.setValueAtTime(12, context.currentTime)
  compressor.ratio.setValueAtTime(4, context.currentTime)
  compressor.attack.setValueAtTime(0.004, context.currentTime)
  compressor.release.setValueAtTime(0.18, context.currentTime)
  master.gain.setValueAtTime(0.0001, context.currentTime)
  master.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.7)
  master.connect(compressor)
  compressor.connect(context.destination)
  bgmMaster = master
  bgmCompressor = compressor
  scheduleMusic()
  bgmTimer = setInterval(scheduleMusic, MUSIC_INTERVAL_MS)
}

export function setBgmWanted(wanted: number) {
  musicWanted = Math.max(0, Math.min(5, Math.round(wanted)))
}

export function stopBgm() {
  if (bgmTimer) clearInterval(bgmTimer)
  bgmTimer = null
  const master = bgmMaster
  const compressor = bgmCompressor
  bgmMaster = null
  bgmCompressor = null
  if (!context || !master) return
  const now = context.currentTime
  master.gain.cancelScheduledValues(now)
  master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now)
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
  setTimeout(() => {
    master.disconnect()
    compressor?.disconnect()
  }, 300)
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

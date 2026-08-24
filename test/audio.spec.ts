import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BGM_BASE_TEMPO, TANKER_EXPLOSION_SCALE, bgmTempoForWave, getAudioVolumes, playVehicleExplosionSound, setBgmVolume, setSfxVolume, unlockAudio } from '../src/audio'

describe('procedural chase music', () => {
  it('starts brisk and raises tempo with wave stage', () => {
    expect(bgmTempoForWave(0)).toBe(BGM_BASE_TEMPO)
    expect(bgmTempoForWave(3)).toBe(BGM_BASE_TEMPO + 15)
    expect(bgmTempoForWave(7)).toBe(BGM_BASE_TEMPO + 35)
  })

  it('clamps invalid wave stages to the supported boss-wave range', () => {
    expect(bgmTempoForWave(-10)).toBe(BGM_BASE_TEMPO)
    expect(bgmTempoForWave(99)).toBe(BGM_BASE_TEMPO + 35)
  })
})

describe('audio volume settings', () => {
  it('updates BGM and sound-effect volume independently', () => {
    const original = getAudioVolumes()
    try {
      setBgmVolume(0.35)
      setSfxVolume(0.7)
      expect(getAudioVolumes()).toEqual({ bgm: 0.35, sfx: 0.7 })
    } finally {
      setBgmVolume(original.bgm)
      setSfxVolume(original.sfx)
    }
  })

  it('clamps volume values to the supported range', () => {
    const original = getAudioVolumes()
    try {
      setBgmVolume(-1)
      setSfxVolume(5)
      expect(getAudioVolumes()).toEqual({ bgm: 0, sfx: 1 })
    } finally {
      setBgmVolume(original.bgm)
      setSfxVolume(original.sfx)
    }
  })
})

describe('road-vehicle explosion', () => {
  it('ships the sample every car, truck and tanker blast plays', () => {
    // The blast is fetched from /audio at runtime, so the guard that matters
    // is that the file is actually in the folder that gets served.
    const shipped = Object.keys(import.meta.glob('../public/audio/*.wav'))
    expect(shipped).toContain('../public/audio/vehicle-explosion.wav')
  })

  it('plays a tanker louder than a car or box truck', () => {
    expect(TANKER_EXPLOSION_SCALE).toBeGreaterThan(1)
  })

  it('stays silent instead of throwing before the audio context is unlocked', () => {
    expect(() => playVehicleExplosionSound()).not.toThrow()
    expect(() => playVehicleExplosionSound(TANKER_EXPLOSION_SCALE)).not.toThrow()
  })
})

/**
 * The level a blast is played at is decided inside `playVehicleExplosionSound`
 * and only ever shows up on a gain node, so a stand-in audio graph is the only
 * place the tanker's extra weight can actually be observed.
 */
type PlayedBlast = { level: number; buffer: unknown }

function fakeAudioGraph(fetched: string[], played: PlayedBlast[]) {
  const createGain = () => {
    const node = {
      gain: {
        value: 1,
        setValueAtTime(value: number) { node.gain.value = value },
        exponentialRampToValueAtTime() {},
      },
      connect() {},
    }
    return node
  }
  const createBufferSource = () => {
    const source = {
      buffer: null as unknown,
      sink: null as ReturnType<typeof createGain> | null,
      connect(node: ReturnType<typeof createGain>) { source.sink = node },
      start() { played.push({ buffer: source.buffer, level: source.sink?.gain.value ?? 0 }) },
    }
    return source
  }
  const context = {
    state: 'running',
    currentTime: 0,
    destination: {},
    createGain,
    createBufferSource,
    createOscillator: () => ({ type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }),
    decodeAudioData: async () => ({ duration: 1 }),
    resume() {},
  }
  const fetchStub = async (input: unknown) => {
    fetched.push(String(input))
    return { arrayBuffer: async () => new ArrayBuffer(8) }
  }
  return { context, fetchStub }
}

describe('road-vehicle explosion playback', () => {
  const fetched: string[] = []
  const played: PlayedBlast[] = []
  const originalAudioContext = globalThis.AudioContext
  const originalFetch = globalThis.fetch

  beforeAll(async () => {
    const { context, fetchStub } = fakeAudioGraph(fetched, played)
    globalThis.AudioContext = (function FakeAudioContext() { return context }) as unknown as typeof AudioContext
    globalThis.fetch = fetchStub as unknown as typeof fetch
    unlockAudio()
    // The first request arrives before the sample has decoded, so it is queued
    // and replayed once the buffer lands - the same path a player takes on the
    // very first kill of a run.
    playVehicleExplosionSound()
    // A timer, not a microtask count: the queued replay sits behind the whole
    // fetch-decode chain, and only draining the task queue is sure to reach it
    // before the tanker's blast is asked for.
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    playVehicleExplosionSound(TANKER_EXPLOSION_SCALE)
  })

  afterAll(() => {
    globalThis.AudioContext = originalAudioContext
    globalThis.fetch = originalFetch
  })

  it('fetches the shipped sample once and reuses the decoded buffer', () => {
    expect(fetched.filter((url) => url === '/audio/vehicle-explosion.wav')).toHaveLength(1)
    expect(played).toHaveLength(2)
    expect(played[0]?.buffer).toBe(played[1]?.buffer)
  })

  it('gives the tanker a louder level than a car or box truck', () => {
    const [vehicle, tanker] = played
    expect(vehicle!.level).toBeGreaterThan(0)
    expect(tanker!.level).toBeGreaterThan(vehicle!.level)
  })

  it('keeps even the tanker well under the drone and building blasts', () => {
    // The whole point of the cut: a road vehicle happens constantly, so it has
    // to sit under the two rarer blasts (0.58 and 0.66) rather than beside
    // them. Anything that creeps back up towards those is the old problem.
    const [, tanker] = played
    expect(tanker!.level).toBeLessThan(0.4)
  })
})

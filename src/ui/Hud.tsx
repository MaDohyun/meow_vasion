import { useEffect, useRef, useState, type FormEvent as ReactFormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { NAME_MAX_LENGTH, isNameAcceptable, makeEntry, type RankedEntry } from '../core/leaderboard'
import { leaderboard, type LeaderboardSource } from '../net/leaderboard'
import { useGame } from '../GameContext'
import { LANGUAGES, LANGUAGE_LABELS, bulletinFor, formatMessage } from '../i18n'
import { broadcastPhase, broadcastProgress } from '../core/broadcast'
import { UPGRADE_DEFINITIONS, type UpgradeId } from '../core/upgrades'
import { Radar } from './Radar'
import { pilotFrameStyle } from '../render/pilotArt'
import { getAudioVolumes, setBgmVolume, setSfxVolume, startLobbyMusic, unlockAudio } from '../audio'

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

function MissionPanel() {
  const { snapshot, t } = useGame()
  if (snapshot.tutorial) {
    return (
      <section className="mission-panel panel tutorial-mission">
        <span className="eyebrow">{t.tutorialMissionEyebrow}</span>
        <strong>{t.tutorialMissionLead}</strong>
        <p><b>E</b> {t.tutorialMissionAction}</p>
      </section>
    )
  }
  if (snapshot.missionStage < 1) return null
  return (
    <section className={`mission-panel panel ${snapshot.missionPulse > 0 ? 'mission-pulse' : ''}`}>
      <span className="eyebrow">{t.mission} {Math.min(3, snapshot.missionStage)}</span>
      {snapshot.missionQuests.map((quest) => (
        <div key={quest.id} data-complete={quest.complete}>
          <i>{quest.complete ? '✓' : '·'}</i>
          <span>{t.missionCopy[quest.id]}</span>
          <b>{Math.floor(quest.progress)}/{Math.floor(quest.target)}</b>
        </div>
      ))}
    </section>
  )
}

function Joystick() {
  const { setMobileInput } = useGame()
  const origin = useRef({ x: 0, y: 0 })
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const dx = event.clientX - origin.current.x
    const dy = event.clientY - origin.current.y
    const length = Math.hypot(dx, dy)
    const scale = length > 44 ? 44 / length : 1
    const x = dx * scale
    const y = dy * scale
    setKnob({ x, y })
    setMobileInput({ active: true, steer: -x / 44, throttle: -y / 44 })
  }

  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setKnob({ x: 0, y: 0 })
    setMobileInput({ throttle: 0, steer: 0 })
  }

  return (
    <div
      className="joystick"
      aria-label="movement joystick"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        origin.current = { x: event.clientX, y: event.clientY }
        setMobileInput({ active: true })
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

function HoldButton({
  className,
  label,
  field,
}: {
  className: string
  label: string
  field: 'beam' | 'laser' | 'special'
}) {
  const { setMobileInput } = useGame()
  return (
    <button
      className={`round-button ${className}`}
      onPointerDown={() => setMobileInput({ active: true, [field]: true, ...(field === 'laser' ? { laserContinuous: true } : {}) })}
      onPointerUp={() => setMobileInput({ [field]: false, ...(field === 'laser' ? { laserContinuous: false } : {}) })}
      onPointerCancel={() => setMobileInput({ [field]: false, ...(field === 'laser' ? { laserContinuous: false } : {}) })}
      onPointerLeave={() => setMobileInput({ [field]: false, ...(field === 'laser' ? { laserContinuous: false } : {}) })}
    >{label}</button>
  )
}

function MobileControls() {
  const { setMobileInput } = useGame()
  const altitude = (value: number) => ({
    onPointerDown: () => setMobileInput({ active: true, vertical: value }),
    onPointerUp: () => setMobileInput({ vertical: 0 }),
    onPointerCancel: () => setMobileInput({ vertical: 0 }),
    onPointerLeave: () => setMobileInput({ vertical: 0 }),
  })
  return (
    <div className="mobile-controls">
      <Joystick />
      <div className="mobile-altitude">
        <button className="alt-button" {...altitude(1)}>▲</button>
        <button className="alt-button" {...altitude(-1)}>▼</button>
      </div>
      <div className="mobile-actions">
        <HoldButton className="boost-button" label="BOOST" field="special" />
        <HoldButton className="laser-button" label="LASER" field="laser" />
        <HoldButton className="beam-button" label="BEAM" field="beam" />
      </div>
    </div>
  )
}

function Options({ onClose }: { onClose: () => void }) {
  const { quality, setQuality, language, setLanguage, t } = useGame()
  const initialVolumes = useRef(getAudioVolumes())
  const [bgmVolume, setBgmVolumeState] = useState(initialVolumes.current.bgm)
  const [sfxVolume, setSfxVolumeState] = useState(initialVolumes.current.sfx)

  const volumeRow = (label: string, value: number, setVolume: (volume: number) => void) => {
    const percent = Math.round(value * 100)
    return (
      <label className="option-row audio-option">
        <span>{label}</span>
        <span className="volume-control">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={percent}
            aria-label={label}
            onChange={(event) => setVolume(Number(event.currentTarget.value) / 100)}
          />
          <output>{percent}%</output>
        </span>
      </label>
    )
  }

  return (
    <div className="overlay options-overlay">
      <div className="options-card panel">
        <span className="eyebrow">{t.options}</span>
        <div className="option-row">
          <span>{t.graphics}</span>
          <div className="option-choices">
            {(['high', 'low'] as const).map((level) => (
              <button key={level} type="button" className={quality === level ? 'selected' : ''} onClick={() => setQuality(level)}>
                {level === 'high' ? t.qualityHigh : t.qualityLow}
              </button>
            ))}
          </div>
        </div>
        <div className="option-row">
          <span>{t.language}</span>
          <div className="option-choices">
            {LANGUAGES.map((code) => (
              <button key={code} type="button" className={language === code ? 'selected' : ''} onClick={() => setLanguage(code)}>
                {LANGUAGE_LABELS[code]}
              </button>
            ))}
          </div>
        </div>
        {volumeRow(t.bgmVolume, bgmVolume, (volume) => {
          setBgmVolumeState(volume)
          setBgmVolume(volume)
        })}
        {volumeRow(t.sfxVolume, sfxVolume, (volume) => {
          setSfxVolumeState(volume)
          setSfxVolume(volume)
        })}
        <button className="primary-button" onClick={onClose}>{t.close}</button>
      </div>
    </div>
  )
}

function Intro() {
  const { start, t } = useGame()
  const [optionsOpen, setOptionsOpen] = useState(false)
  useEffect(() => {
    // Try immediately for browsers that permit it. Otherwise retry from the
    // first intentional lobby input, which satisfies autoplay policy.
    startLobbyMusic()
    const enableMusic = () => {
      unlockAudio()
      startLobbyMusic()
    }
    window.addEventListener('pointerdown', enableMusic, { once: true })
    window.addEventListener('keydown', enableMusic, { once: true })
    return () => {
      window.removeEventListener('pointerdown', enableMusic)
      window.removeEventListener('keydown', enableMusic)
    }
  }, [])
  if (optionsOpen) return <Options onClose={() => setOptionsOpen(false)} />
  return (
    <div className="overlay intro-overlay">
      <div className="sun-disc" />
      <div className="ufo-poster" aria-hidden="true">
        <i className="ufo-dome" /><i className="ufo-saucer" /><i className="poster-beam" />
      </div>
      <div className="title-kicker">{t.titleKicker}</div>
      <h1><span>{t.titleLine1}</span><span>{t.titleLine2}</span></h1>
      <p className="tagline">{t.tagline}</p>
      <div className="intro-actions">
        <button className="primary-button" onClick={start}>{t.start}</button>
        <button className="secondary-button" onClick={() => setOptionsOpen(true)}>{t.options}</button>
      </div>
      <div className="controls-card">
        <span><b>W/S</b> {t.controlFly}</span>
        <span><b>A/D</b> {t.controlStrafe}</span>
        <span><b>MOUSE</b> {t.controlAim}</span>
        <span><b>E</b> {t.controlBeam}</span>
        <span><b>Q</b> {t.controlLaser} · {t.hold}</span>
        <span><b>SPACE</b> {t.controlBoost}</span>
      </div>
    </div>
  )
}

/**
 * The general's briefing, run once at the start of a tutorial.
 *
 * Steps 1-4 wait for a click. Step 5 is the actual "hold E" instruction, so it
 * can only be cleared by pressing E - a click would let a player skip past the
 * one control the tutorial is teaching. Steps 6-7 fire after the beam has
 * already started the tutorial pickup, so gameplay is already moving; they
 * advance on their own so they never block the player's hands.
 */
function BossBriefing() {
  const { snapshot, unlockTutorialBeam, t } = useGame()
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const steps = t.tutorialBriefing

  useEffect(() => {
    // E is inert in the simulation until this fires (see beamUnlocked in
    // GameContext's advance()) - otherwise a tap on E while an earlier line
    // is still showing would finish the tutorial in the background and let
    // the ship take off mid-briefing.
    if (step === 4) unlockTutorialBeam()
  }, [step, unlockTutorialBeam])

  useEffect(() => {
    if (step === 4 && snapshot.beamActive) setStep(5)
  }, [step, snapshot.beamActive])

  useEffect(() => {
    if (done) return
    const auto = steps[step]?.auto
    if (!auto) return
    const timer = window.setTimeout(() => {
      setStep((current) => {
        if (current >= steps.length - 1) {
          setDone(true)
          return current
        }
        return current + 1
      })
    }, auto * 1000)
    return () => window.clearTimeout(timer)
  }, [step, done, steps])

  if (done) return null
  const current = steps[step]
  if (!current) return null

  const clickable = !current.wait && !current.auto
  const advance = () => {
    if (!clickable) return
    setStep((s) => Math.min(s + 1, steps.length - 1))
  }
  const skip = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    setStep(4)
  }

  return (
    <div className={`briefing-touch ${clickable ? 'clickable' : ''}`} onClick={clickable ? advance : undefined}>
      <div className="briefing-box">
        <div className="briefing-portrait" aria-hidden="true" />
        <div className="briefing-panel">
          <span className="eyebrow">{t.briefingTitle}</span>
          {current.lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          {clickable && <span className="briefing-hint">{t.briefingContinue}</span>}
          {step === 0 && (
            <button type="button" className="briefing-skip" onClick={skip}>
              {t.briefingSkip}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The ranking panel, opened from the results screen.
 *
 * It is a panel over the results rather than a section inside them because the
 * results screen is already a full column of type on a phone, and because
 * signing a run is a decision the player either makes or skips - putting a text
 * box permanently in the middle of the screen turns "play again" into a form to
 * dismiss.
 *
 * Four states, and the reason each one exists:
 *
 * - `form`   the name box, opened by the button. The board loads underneath it
 *            at the same time, so the player can see what they are aiming at
 *            while they type.
 * - `sending` the submit is in flight. The button is disabled here because a
 *            second press would write a second row, not retry the first.
 * - `saved`  the record landed. The board is re-shown with the new row lit up,
 *            and the form is gone: one run is one record.
 * - `error`  the sheet refused or could not be reached. This is the one state
 *            that keeps the form, because the record is genuinely not saved and
 *            pressing again is the right thing to do.
 */
function RankingPanel({ onClose }: { onClose: () => void }) {
  const { snapshot, t } = useGame()
  const [name, setName] = useState(() => leaderboard.readStoredName())
  const [stage, setStage] = useState<'form' | 'sending' | 'saved' | 'error'>('form')
  const [entries, setEntries] = useState<RankedEntry[] | null>(null)
  const [source, setSource] = useState<LeaderboardSource>('remote')
  const [rank, setRank] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  /** The row to light up: the submitted record, matched by its timestamp. */
  const [mine, setMine] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void leaderboard.load().then((result) => {
      if (cancelled) return
      setEntries(result.entries)
      setSource(result.source)
    })
    inputRef.current?.focus()
    return () => { cancelled = true }
  }, [])

  const submit = async (event: ReactFormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (stage === 'sending') return
    if (!isNameAcceptable(name)) {
      setNotice(t.rankingNameRequired)
      return
    }
    const entry = makeEntry({
      name,
      score: snapshot.score,
      survivalTime: snapshot.survivalTime,
      waveStage: snapshot.waveStage,
      victory: snapshot.victory,
      recordedAt: Date.now(),
    })
    setStage('sending')
    setNotice('')
    try {
      const result = await leaderboard.submit(entry)
      leaderboard.storeName(entry.name)
      setEntries(result.entries)
      setSource(result.source)
      setRank(result.rank)
      setMine(entry.recordedAt)
      setStage('saved')
    } catch {
      setStage('error')
      setNotice(t.rankingFailed)
    }
  }

  const saved = stage === 'saved'
  return (
    <div className="overlay ranking-overlay" role="dialog" aria-modal="true" aria-label={t.rankingTitle}>
      <div className="ranking-panel">
        <span className="eyebrow">{t.rankingTitle}</span>
        {!saved && <p className="ranking-lead">{t.rankingLead}</p>}
        {saved && (
          <p className="ranking-lead ranking-saved">
            {rank === null ? t.rankingSavedOffBoard : t.rankingSaved(rank)}
          </p>
        )}

        {!saved && (
          <form className="ranking-form" onSubmit={submit}>
            <label htmlFor="ranking-name">{t.rankingNameLabel}</label>
            <input
              id="ranking-name"
              ref={inputRef}
              type="text"
              value={name}
              maxLength={NAME_MAX_LENGTH * 2}
              autoComplete="off"
              placeholder={t.rankingNamePlaceholder}
              onChange={(event) => setName(event.target.value)}
              disabled={stage === 'sending'}
            />
            <button type="submit" className="primary-button" disabled={stage === 'sending'}>
              {stage === 'sending' ? t.rankingSending : stage === 'error' ? t.rankingTryAgain : t.rankingSubmit}
            </button>
          </form>
        )}

        {notice && <p className="ranking-notice" role="alert">{notice}</p>}
        {/* Only worth saying once the board is actually on screen, and only
            when it is this browser's board rather than everyone's. */}
        {entries !== null && source === 'local' && <p className="ranking-notice">{t.rankingLocalNote}</p>}

        <div className="ranking-board">
          <div className="ranking-row ranking-head">
            <span>{t.rankingColRank}</span>
            <span>{t.rankingColName}</span>
            <span>{t.rankingColScore}</span>
            <span>{t.rankingColTime}</span>
          </div>
          {entries === null && <p className="ranking-empty">{t.rankingLoading}</p>}
          {entries !== null && entries.length === 0 && <p className="ranking-empty">{t.rankingEmpty}</p>}
          {entries?.map((entry) => (
            <div
              key={`${entry.recordedAt}-${entry.name}-${entry.rank}`}
              className="ranking-row"
              data-mine={entry.recordedAt === mine}
            >
              <span>{entry.rank}</span>
              <span className="ranking-name">
                {entry.name}
                {entry.recordedAt === mine && <i>{t.rankingYou}</i>}
              </span>
              <span>{Math.floor(entry.score).toLocaleString()}</span>
              <span>{formatTime(entry.survivalTime)}</span>
            </div>
          ))}
        </div>

        <button type="button" className="ghost-button" onClick={onClose}>{t.rankingClose}</button>
      </div>
    </div>
  )
}

function Results() {
  const { snapshot, restart, t } = useGame()
  const survived = snapshot.victory
  const [ranking, setRanking] = useState(false)
  return (
    <div className={`overlay results-overlay ${survived ? 'victory' : 'defeat'}`}>
      <span className="eyebrow">{survived ? t.survivedTitle : t.collapsedTitle}</span>
      <h2>{survived ? t.survivedTitle : t.collapsedTitle}</h2>
      {/* Saying why it ended matters more on the losing screen: collapse is a
          slow failure the player may not have felt arriving. */}
      <p className="result-lead">{survived ? t.survivedLead : t.collapsedLead}</p>
      <strong className="final-score">{Math.floor(snapshot.score).toLocaleString()}</strong>
      <p>{t.finalScore}</p>
      <div className="result-stats">
        <span><b>{formatTime(snapshot.survivalTime)}</b> {t.statSurvived}</span>
        <span><b>×{snapshot.size.toFixed(2)}</b> {t.statMass}</span>
        <span><b>{snapshot.absorbedCount}</b> {t.statAbsorbed}</span>
        <span><b>{snapshot.waveStage}</b> {t.statWave}</span>
      </div>
      {/* Replaying is still the primary action - the board is the detour, not
          the destination - so it keeps the loud button and the first slot. */}
      <div className="result-actions">
        <button className="primary-button" onClick={restart}>{t.retry}</button>
        <button type="button" className="ghost-button" onClick={() => setRanking(true)}>{t.rankingOpen}</button>
      </div>
      {ranking && <RankingPanel onClose={() => setRanking(false)} />}
    </div>
  )
}

/**
 * The wave bulletin, as a broadcast lower third.
 *
 * It goes at the bottom because that is where a chyron belongs and because the
 * middle of the screen is already the reticle plus the arcade wave label. It
 * sits above the bottom instrument row rather than across it, so the radar,
 * the systems panel and the flight card all stay readable while it is on air.
 *
 * The little bust on the left is the same anchor that is on the city's news
 * screens, drawn in the same four colours - without it the band is just a
 * caption, with it the player connects the words to the face they can see on
 * the buildings.
 */
function BreakingNews() {
  const { snapshot, t } = useGame()
  if (snapshot.broadcastStage === null) return null
  const bulletin = bulletinFor(t, snapshot.broadcastStage)
  const phase = broadcastPhase(snapshot.broadcastRemaining)
  return (
    <aside className="breaking-band" data-phase={phase} role="status" aria-live="polite">
      <div className="breaking-anchor" aria-hidden="true" />
      <div className="breaking-body">
        <div className="breaking-head">
          <span className="breaking-flag">{t.breakingFlag}</span>
          <strong>{bulletin.headline}</strong>
        </div>
        <p>{bulletin.line}</p>
      </div>
      <i className="breaking-timer" style={{ width: `${(1 - broadcastProgress(snapshot.broadcastRemaining)) * 100}%` }} />
    </aside>
  )
}

/**
 * The upgrade card screen.
 *
 * The run is stopped behind this - not slowed, stopped. A card that slid past
 * while drones were converging would be taken by whichever hand was already
 * moving, and that is not a choice. Three cards, one taken, back to flying.
 *
 * Number keys as well as clicks: the whole game is played on the keyboard with
 * the mouse aiming, so reaching for a button mid-run is the awkward option and
 * has to be the alternative rather than the only way.
 */
function UpgradeCards() {
  const { snapshot, chooseUpgrade, t } = useGame()
  const choices = snapshot.upgradeChoices
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1
      if (index >= 0 && index < choices.length) chooseUpgrade(choices[index]!)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choices, chooseUpgrade])
  return (
    <div className="overlay upgrade-overlay">
      <span className="eyebrow">{t.upgradeTitle}</span>
      <p className="upgrade-lead">{t.upgradeLead}</p>
      <div className="upgrade-cards">
        {choices.map((id, index) => {
          const level = snapshot.upgradeLevels[id] ?? 0
          const max = UPGRADE_DEFINITIONS[id].maxLevel
          const copy = t.upgrades[id]
          return (
            <button key={id} className="upgrade-card" type="button" onClick={() => chooseUpgrade(id)}>
              <i>{index + 1}</i>
              <strong>{copy.name}</strong>
              <small>{copy.detail}</small>
              <b>{level + 1 >= max ? t.upgradeMaxed : `${t.upgradeLevel}.${level} → ${t.upgradeLevel}.${level + 1}`}</b>
            </button>
          )
        })}
      </div>
      <span className="upgrade-hint">{t.upgradeHint}</span>
    </div>
  )
}

export function Hud() {
  const { snapshot, t } = useGame()
  const [briefingRun, setBriefingRun] = useState(0)
  const prevPhase = useRef(snapshot.phase)
  useEffect(() => {
    // A fresh run (from the intro or a restart) gets a new briefing. Passing
    // through 'upgrade' and back does not - that would replay the whole
    // sequence from the top if a card happened to land mid-briefing.
    if (snapshot.phase === 'playing' && prevPhase.current !== 'playing' && prevPhase.current !== 'upgrade') {
      setBriefingRun((run) => run + 1)
    }
    prevPhase.current = snapshot.phase
  }, [snapshot.phase])
  if (snapshot.phase === 'intro') return <Intro />
  return (
    <>
      <div className="hud" data-dazed={snapshot.daze > 0}>
        {/* Two resources, two readouts. They used to be one - size was health -
            and that made a hit rewind the best part of the game. */}
        <section className={`time-card panel ${snapshot.healthRatio <= 0.25 ? 'time-warning' : ''}`}>
          <span className="eyebrow">{t.mass}</span>
          <strong className={snapshot.sizePulse > 0.01 ? 'mass-pulse' : ''}>×{snapshot.size.toFixed(2)}</strong>
          <p>{t.massHint}</p>
          <div className="health-bar" data-regen={snapshot.regenerating}>
            {Array.from({ length: snapshot.healthMax }, (_, pip) => (
              <i key={pip} data-state={snapshot.health >= pip + 1 ? 'full' : snapshot.health > pip ? 'part' : 'empty'} />
            ))}
          </div>
          {snapshot.shieldMax > 0 && (
            <div className="shield-bar" data-regen={snapshot.shieldRegenerating}>
              {Array.from({ length: snapshot.shieldMax }, (_, pip) => (
                <i key={pip} data-state={snapshot.shield >= pip + 1 ? 'full' : snapshot.shield > pip ? 'part' : 'empty'} />
              ))}
              <b>{t.shield} {snapshot.shield.toFixed(1)}/{snapshot.shieldMax}</b>
            </div>
          )}
          <small>
            {t.hull} {Math.ceil(snapshot.health)}/{snapshot.healthMax}
            {snapshot.regenerating ? ` · ${t.repairing}` : ''} / {t.clock} {formatTime(snapshot.remainingTime)}
          </small>
        </section>

        <MissionPanel />

        <section className="score-card panel">
          <span className="eyebrow">{t.score}</span>
          <strong>{Math.floor(snapshot.score).toLocaleString()}</strong>
          {/* The city clock, so "the run starts at six" is something the
              player can read rather than something the sky merely implies. */}
          <div><b>{t.wave} {snapshot.waveStage}</b> · {snapshot.daylightClock} {snapshot.daylightLabel}</div>
          <time>{t.run} {formatTime(snapshot.survivalTime)}</time>
        </section>

        {/* The battleship's health, across the top of the screen.
            Sixty-four laser hits is a long time to shoot at something with no
            sign of progress - without this the fight reads as an invulnerable
            set piece and the player stops firing. */}
        {snapshot.bossHealth !== null && (
          <div className="boss-bar" role="progressbar" aria-valuenow={Math.round(snapshot.bossHealth * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span className="eyebrow">{t.bossName}</span>
            <div className="boss-bar-track"><i style={{ width: `${snapshot.bossHealth * 100}%` }} /></div>
          </div>
        )}

        <div className="hud-center">
          {snapshot.missionBanner && (
            <div className="mission-banner">
              {snapshot.missionBanner.type === 'stage-complete'
                ? t.missionStageComplete(snapshot.missionBanner.previousStage, snapshot.missionBanner.nextStage)
                : t.reconComplete}
            </div>
          )}
          {(snapshot.messageKey || snapshot.message) && (
            <div className="message">
              {snapshot.messageKey ? formatMessage(t, snapshot.messageKey, snapshot.messageArg) : snapshot.message}
            </div>
          )}
        </div>

        <Radar />

        {/* Turbo and overload are the two things that can kill a run on their
            own (stranded with no boost, or crushed under too much cargo), so
            they are the only readouts kept here - everything else this panel
            used to carry (beam lock, altitude band) was detail the player
            could live without. Both are bars first, numbers second: a raw
            tonnage figure does not tell you how close to the ceiling you are
            the way a fill level does. */}
        <section className="systems-panel panel">
          <div className="system-meter" data-active={snapshot.boostActive}>
            <span>SPACE · {t.turbo} <b>{snapshot.boostActive ? t.turboActive : `${Math.round(snapshot.turbo * 100)}%`}</b></span>
            <div><i style={{ width: `${snapshot.turbo * 100}%` }} /></div>
          </div>
          <div className="ballast-meter" data-warn={snapshot.overloadWarn > 0} data-critical={snapshot.overloadWarn >= 1}>
            <span>{t.drag} <b>{snapshot.overloadWarn >= 1 ? t.overloaded : `${Math.round(snapshot.cargoSlowdown * 100)}% ${t.slowdown}`}</b></span>
            <div><i style={{ width: `${Math.min(100, (snapshot.ballast / snapshot.ballastLimit) * 100)}%` }} /></div>
          </div>
        </section>
        <section className="pilot-card panel" data-expression={snapshot.pilotExpression} aria-label={`pilot expression ${snapshot.pilotExpression}`}>
          <div className="pilot-portrait" style={pilotFrameStyle(snapshot.pilotExpression)} />
          <div><span className="eyebrow">{t.pilotCam}</span><b>{snapshot.pilotExpression.toUpperCase()}</b></div>
        </section>
        {snapshot.overloadWarn >= 1 && <div className="overload-alarm">{t.overloadAlarm}</div>}
        {snapshot.waterAnchored && <div className="water-alarm">{t.waterAlarm}</div>}
        <BreakingNews />
        {snapshot.timeBonusPulse > 0 && <div className="time-bonus">+{snapshot.timeBonusAmount}s</div>}
        <div
          className="reticle"
          style={{ left: `${50 + snapshot.aimX * 50}%`, top: `${50 + snapshot.aimY * 50}%` }}
        ><i /><i /></div>
        {/* Flight, laser, turbo and drop are all inert during the tutorial -
            this is the one thing left to try, so it has to name itself.
            Held back until the briefing actually reaches that instruction -
            E does nothing before then, so the prompt shouldn't invite it. */}
        {snapshot.tutorial && snapshot.tutorialBriefingReady && !snapshot.beamActive && (
          <div
            className="tutorial-e-prompt"
            style={{ left: `${50 + snapshot.aimX * 50}%`, top: `${50 + snapshot.aimY * 50}%` }}
          >
            <b>E</b>
            <span>{t.tutorialPressE}</span>
          </div>
        )}
        {(snapshot.phase === 'playing' || snapshot.phase === 'upgrade') && <BossBriefing key={briefingRun} />}
      </div>
      <MobileControls />
      {snapshot.phase === 'upgrade' && <UpgradeCards />}
      {snapshot.phase === 'results' && <Results />}
    </>
  )
}

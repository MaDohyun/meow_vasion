import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useGame } from '../GameContext'
import { LANGUAGES, LANGUAGE_LABELS, bulletinFor, formatMessage } from '../i18n'
import { broadcastPhase, broadcastProgress } from '../core/broadcast'
import { UPGRADE_DEFINITIONS, type UpgradeId } from '../core/upgrades'
import type { MissionQuestId } from '../core/missions'
import { Radar } from './Radar'
import { pilotFrameStyle } from '../render/pilotArt'
import { startLobbyMusic, unlockAudio } from '../audio'

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

const MISSION_COPY: Record<MissionQuestId, string> = {
  'capture-cats': '동포 고양이 구출! (아직 지구에 남은 동료가 있어)',
  'capture-people': '지구인 표본 챙기기',
  'destroy-cars': '승용차를 깡통으로 만들기',
  'destroy-trucks': '트럭 해체 쇼',
  'absorb-water': '호수 물 쪽 빨아보기',
  'ruin-buildings': '건물을 폐허로 리모델링',
  'destroy-gas-station': '주유소 불꽃놀이',
  'destroy-comms': '지구 통신 끊어놓기',
  'destroy-drones': '드론은 Q 연속 레이저로 톡톡',
  'destroy-fighters': '전투기 격추하기',
  'air-checkpoints': '상공 고리 통과',
  'destroy-battleship': '저 큰 전함 치우기',
  'reach-score': '보고서용 점수 채우기',
  'survive-final': '퇴근 시간까지 버티기',
}

function MissionPanel() {
  const { snapshot } = useGame()
  if (snapshot.tutorial) {
    return (
      <section className="mission-panel panel tutorial-mission">
        <span className="eyebrow">장군의 첫 무전</span>
        <strong>“대원, 공원에 남은 동포 고양이부터 구출해 봐.”</strong>
        <p><b>E</b> 트랙터 빔으로 고양이 구출</p>
      </section>
    )
  }
  if (snapshot.missionStage < 1) return null
  return (
    <section className={`mission-panel panel ${snapshot.missionPulse > 0 ? 'mission-pulse' : ''}`}>
      <span className="eyebrow">미션 {Math.min(3, snapshot.missionStage)}</span>
      {snapshot.missionQuests.map((quest) => (
        <div key={quest.id} data-complete={quest.complete}>
          <i>{quest.complete ? '✓' : '·'}</i>
          <span>{MISSION_COPY[quest.id]}</span>
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
        <span><b>Q</b> {t.controlLaser} · HOLD</span>
        <span><b>R</b> {t.controlDump}</span>
        <span><b>SPACE</b> {t.controlBoost}</span>
      </div>
    </div>
  )
}

function Results() {
  const { snapshot, restart, t } = useGame()
  const survived = snapshot.victory
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
      <button className="primary-button" onClick={restart}>{t.retry}</button>
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
              <b>쉴드 {snapshot.shield.toFixed(1)}/{snapshot.shieldMax}</b>
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
          {snapshot.missionBanner && <div className="mission-banner">{snapshot.missionBanner}</div>}
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
        <BreakingNews />
        {snapshot.timeBonusPulse > 0 && <div className="time-bonus">+{snapshot.timeBonusAmount}s</div>}
        <div
          className="reticle"
          style={{ left: `${50 + snapshot.aimX * 50}%`, top: `${50 + snapshot.aimY * 50}%` }}
        ><i /><i /></div>
      </div>
      <MobileControls />
      {snapshot.phase === 'upgrade' && <UpgradeCards />}
      {snapshot.phase === 'results' && <Results />}
    </>
  )
}

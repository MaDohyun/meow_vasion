import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useGame } from '../GameContext'
import { WEAPON_DEFINITIONS, WEAPON_IDS } from '../core/weapons'
import { LANGUAGES, LANGUAGE_LABELS, formatMessage } from '../i18n'
import { Radar } from './Radar'
import { pilotFrameStyle } from '../render/pilotArt'

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
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
      onPointerDown={() => setMobileInput({ active: true, [field]: true })}
      onPointerUp={() => setMobileInput({ [field]: false })}
      onPointerCancel={() => setMobileInput({ [field]: false })}
      onPointerLeave={() => setMobileInput({ [field]: false })}
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
  const { snapshot, start, selectWeapon, t } = useGame()
  const [optionsOpen, setOptionsOpen] = useState(false)
  if (optionsOpen) return <Options onClose={() => setOptionsOpen(false)} />
  return (
    <div className="overlay intro-overlay">
      <div className="sun-disc" />
      <div className="ufo-poster" aria-hidden="true">
        <i className="ufo-dome" /><i className="ufo-saucer" /><i className="poster-beam" />
      </div>
      <div className="title-kicker">UFO ATTACK SURVIVAL</div>
      <h1><span>UFO</span><span>어택 서바이벌</span></h1>
      <p className="tagline">{t.tagline}</p>
      <div className="weapon-picker" aria-label={t.weaponPicker}>
        {WEAPON_IDS.map((weapon) => {
          const definition = WEAPON_DEFINITIONS[weapon]
          return (
            <button
              key={weapon}
              className={`weapon-choice ${snapshot.selectedWeapon === weapon ? 'selected' : ''}`}
              onClick={() => selectWeapon(weapon)}
              type="button"
            >
              <b>{definition.shortLabel}</b>
              <strong>{definition.label}</strong>
              <small>{definition.description}</small>
            </button>
          )
        })}
      </div>
      <div className="intro-actions">
        <button className="primary-button" onClick={start}>{t.start}</button>
        <button className="secondary-button" onClick={() => setOptionsOpen(true)}>{t.options}</button>
      </div>
      <div className="controls-card">
        <span><b>W/S</b> {t.controlFly}</span>
        <span><b>A/D</b> {t.controlStrafe}</span>
        <span><b>MOUSE</b> {t.controlAim}</span>
        <span><b>E</b> {t.controlBeam}</span>
        <span><b>Q</b> {t.controlLaser}</span>
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

export function Hud() {
  const { snapshot, t } = useGame()
  if (snapshot.phase === 'intro') return <Intro />
  const beamStatus = snapshot.beamActive
    ? [
        snapshot.beamTargetId ? t.beamLocked : null,
        snapshot.beamObjectCount > 0 ? `${t.beamPulling} ${snapshot.beamObjectCount}` : null,
        snapshot.boostActive ? t.beamAmplified : null,
      ].filter(Boolean).join(' · ') || t.beamSearching
    : t.beamReady
  return (
    <>
      <div className="hud" data-dazed={snapshot.daze > 0}>
        <section className={`time-card panel ${snapshot.sizeRatio <= 0.12 ? 'time-warning' : ''}`}>
          <span className="eyebrow">{t.mass}</span>
          <strong className={snapshot.sizePulse > 0.01 ? 'mass-pulse' : ''}>×{snapshot.size.toFixed(2)}</strong>
          <p>{t.massHint}</p>
          {/* Size is the only fail state, so this bar is the health bar. It reads
              from the death threshold rather than from zero: the number that
              matters is how much room is left before collapse. */}
          <div className="time-progress"><i style={{ width: `${Math.max(2, snapshot.sizeRatio * 100)}%` }} /></div>
          <small>{t.collapseAt} ×{snapshot.sizeMin.toFixed(2)} / {t.clock} {formatTime(snapshot.remainingTime)}</small>
        </section>

        <section className="score-card panel">
          <span className="eyebrow">{t.score}</span>
          <strong>{Math.floor(snapshot.score).toLocaleString()}</strong>
          <div><b>{t.wave} {snapshot.waveStage}</b> · {snapshot.daylightLabel}</div>
          <time>{t.run} {formatTime(snapshot.survivalTime)}</time>
        </section>

        <div className="hud-center">
          {(snapshot.messageKey || snapshot.message) && (
            <div className="message">
              {snapshot.messageKey ? formatMessage(t, snapshot.messageKey, snapshot.messageArg) : snapshot.message}
            </div>
          )}
        </div>

        <Radar />

        <section className="systems-panel panel">
          <div className="system-meter" data-active={snapshot.boostActive}>
            <span>SPACE · {t.turbo} <b>{snapshot.boostActive ? t.turboActive : `${Math.round(snapshot.turbo * 100)}%`}</b></span>
            <div><i style={{ width: `${snapshot.turbo * 100}%` }} /></div>
          </div>
          <div className="beam-readout" data-active={snapshot.beamActive} data-error={!snapshot.beamAvailable}>
            <span>E · {t.beam}</span><b>{beamStatus}</b>
          </div>
          {/* Hanging mass is the only thing slowing the craft, so it has to be
              visible - otherwise the player just feels sluggish for no stated
              reason and has no cue to hit R. */}
          <div className="cargo-readout" data-error={snapshot.ballast > 4}>
            <span>{t.drag} · {snapshot.ballast.toFixed(1)}t{snapshot.loadedCars > 0 ? ` · ${t.dumpHint}` : ''}</span>
            <b>{Math.round(snapshot.cargoSlowdown * 100)}% {t.slowdown}</b>
          </div>
          <div className="altitude-alert" data-active={snapshot.height >= 28}>
            <span>{snapshot.height >= 28 ? t.bandAa : snapshot.height > 5.5 ? t.bandArmor : t.bandGround}</span>
            <b>{snapshot.height >= 28 ? t.bandAaNote : snapshot.height > 5.5 ? t.bandArmorNote : t.bandGroundNote}</b>
          </div>
          <div className="weapon-readout"><span>{t.auto} · {WEAPON_DEFINITIONS[snapshot.selectedWeapon].shortLabel}</span><b>{snapshot.activeWeaponProjectiles} {t.live}</b></div>
        </section>

        <section className="flight-card panel">
          <div><span className="eyebrow">{t.speed}</span><strong>{Math.round(snapshot.speed * 3.6)}</strong><small>KM/H</small></div>
          <div><span className="eyebrow">{t.altitude}</span><strong>{snapshot.height.toFixed(1)}</strong><small>M</small></div>
          <div><span className="eyebrow">{t.threats}</span><strong>{snapshot.activeEnemies}</strong><small>{t.live}</small></div>
        </section>
        <section className="pilot-card panel" data-expression={snapshot.pilotExpression} aria-label={`pilot expression ${snapshot.pilotExpression}`}>
          <div className="pilot-portrait" style={pilotFrameStyle(snapshot.pilotExpression)} />
          <div><span className="eyebrow">{t.pilotCam}</span><b>{snapshot.pilotExpression.toUpperCase()}</b></div>
        </section>
        {snapshot.timeBonusPulse > 0 && <div className="time-bonus">+{snapshot.timeBonusAmount}s</div>}
        <div
          className="reticle"
          style={{ left: `${50 + snapshot.aimX * 50}%`, top: `${50 + snapshot.aimY * 50}%` }}
        ><i /><i /></div>
      </div>
      <MobileControls />
      {snapshot.phase === 'results' && <Results />}
    </>
  )
}

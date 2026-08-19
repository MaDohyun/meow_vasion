import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useGame } from '../GameContext'
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

function Intro() {
  const { start } = useGame()
  return (
    <div className="overlay intro-overlay">
      <div className="sun-disc" />
      <div className="ufo-poster" aria-hidden="true">
        <i className="ufo-dome" /><i className="ufo-saucer" /><i className="poster-beam" />
      </div>
      <div className="title-kicker">UFO ATTACK SURVIVAL</div>
      <h1><span>UFO</span><span>어택 서바이벌</span></h1>
      <p className="tagline">최대한 오래 살아남으면서 도시를 파괴하세요</p>
      <button className="primary-button" onClick={start}>START SURVIVAL</button>
      <div className="controls-card">
        <span><b>W/S</b> FLY WHERE YOU LOOK</span>
        <span><b>A/D</b> RIGHT / LEFT</span>
        <span><b>MOUSE</b> 3D STEER / AIM</span>
        <span><b>E</b> HOLD TRACTOR BEAM · ABSORB TIME</span>
        <span><b>Q</b> TAP LASER · <b>R</b> DROP CARS</span>
        <span><b>SPACE</b> TURBO BOOST</span>
      </div>
    </div>
  )
}

function Results() {
  const { snapshot, restart } = useGame()
  return (
    <div className={`overlay results-overlay ${snapshot.victory ? 'victory' : 'defeat'}`}>
      <span className="eyebrow">{snapshot.victory ? 'SURVIVAL COMPLETE' : 'TIME DEPLETED'}</span>
      <h2>{snapshot.resultTitle}</h2>
      <strong className="final-score">{Math.floor(snapshot.score).toLocaleString()}</strong>
      <p>FINAL INFAMY SCORE</p>
      <div className="result-stats">
        <span><b>{formatTime(snapshot.survivalTime)}</b> SURVIVED</span>
        <span><b>{snapshot.waveStage}</b> WAVE</span>
        <span><b>{snapshot.enemiesDown}</b> ENEMIES</span>
        <span><b>{snapshot.loadedCars}</b> CARS</span>
      </div>
      <button className="primary-button" onClick={restart}>RAID AGAIN</button>
    </div>
  )
}

export function Hud() {
  const { snapshot } = useGame()
  if (snapshot.phase === 'intro') return <Intro />
  const beamStatus = snapshot.beamActive
    ? [
        snapshot.beamTargetId ? 'LOCKED' : null,
        snapshot.beamObjectCount > 0 ? `PULLING ${snapshot.beamObjectCount}` : null,
        snapshot.boostActive ? 'AMPLIFIED' : null,
      ].filter(Boolean).join(' · ') || 'SEARCHING'
    : 'READY'
  return (
    <>
      <div className="hud">
        <section className={`time-card panel ${snapshot.remainingTime <= 10 ? 'time-warning' : ''}`}>
          <span className="eyebrow">SURVIVAL CLOCK</span>
          <strong>{formatTime(snapshot.remainingTime)}</strong>
          <p>ABSORB PEOPLE AND CATS TO GAIN TIME</p>
          <div className="time-progress"><i style={{ width: `${Math.min(100, snapshot.remainingTime / snapshot.survivalTarget * 100)}%` }} /></div>
          <small>ELAPSED {formatTime(snapshot.survivalTime)} / CLEAR {formatTime(snapshot.survivalTarget)}</small>
        </section>

        <section className="score-card panel">
          <span className="eyebrow">DESTRUCTION SCORE</span>
          <strong>{Math.floor(snapshot.score).toLocaleString()}</strong>
          <div><b>WAVE {snapshot.waveStage}</b> · EVENTS ONLY</div>
          <time>RUN {formatTime(snapshot.survivalTime)}</time>
        </section>

        <div className="hud-center">
          {snapshot.message && <div className="message">{snapshot.message}</div>}
        </div>

        <section className="systems-panel panel">
          <div className="system-meter" data-active={snapshot.boostActive}>
            <span>SPACE · TURBO <b>{snapshot.boostActive ? 'ACTIVE' : `${Math.round(snapshot.turbo * 100)}%`}</b></span>
            <div><i style={{ width: `${snapshot.turbo * 100}%` }} /></div>
          </div>
          <div className="beam-readout" data-active={snapshot.beamActive} data-error={!snapshot.beamAvailable}>
            <span>E · BEAM</span><b>{beamStatus}</b>
          </div>
          <div className="cargo-readout"><span>CARGO · {snapshot.loadedCars}/{snapshot.maxLoadedCars}</span><b>{Math.round(snapshot.cargoSlowdown * 100)}% SLOWDOWN</b></div>
          <div className="altitude-alert" data-active={snapshot.height >= 28}><span>{snapshot.height >= 28 ? 'AA BAND' : snapshot.height > 5.5 ? 'ARMOR BAND' : 'GROUND BAND'}</span><b>{snapshot.height >= 28 ? 'MISSILES LIVE' : snapshot.height > 5.5 ? 'TANKS LIVE' : 'GROUND UNITS LIVE'}</b></div>
        </section>

        <section className="flight-card panel">
          <div><span className="eyebrow">SPEED</span><strong>{Math.round(snapshot.speed * 3.6)}</strong><small>KM/H</small></div>
          <div><span className="eyebrow">ALT</span><strong>{snapshot.height.toFixed(1)}</strong><small>M</small></div>
          <div><span className="eyebrow">THREATS</span><strong>{snapshot.activeEnemies}</strong><small>LIVE</small></div>
        </section>
        <section className="pilot-card panel" data-expression={snapshot.pilotExpression} aria-label={`pilot expression ${snapshot.pilotExpression}`}>
          <div className="pilot-portrait" style={pilotFrameStyle(snapshot.pilotExpression)} />
          <div><span className="eyebrow">PILOT CAM</span><b>{snapshot.pilotExpression.toUpperCase()}</b></div>
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

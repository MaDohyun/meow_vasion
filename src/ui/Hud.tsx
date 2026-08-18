import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useGame } from '../GameContext'

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

function WantedStars() {
  const { snapshot } = useGame()
  return (
    <div className="wanted-wrap" aria-label={`${snapshot.wanted} wanted stars`}>
      <span className="wanted-label">CITY WANTED</span>
      <div className="wanted-stars">
        {Array.from({ length: 5 }, (_, index) => (
          <i key={index} data-active={index < snapshot.wanted}>★</i>
        ))}
      </div>
      <div className="heat-track"><i style={{ width: `${snapshot.heat * 100}%` }} /></div>
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
      <div className="title-kicker">AN UNAUTHORIZED FIELD TRIP</div>
      <h1><span>BEAM</span><span>BANDIT</span></h1>
      <p className="tagline">ONE BEAM. FIVE STARS. ZERO REMORSE.</p>
      <button className="primary-button" onClick={start}>START RAID</button>
      <div className="controls-card">
        <span><b>W/S</b> FLY WHERE YOU LOOK</span>
        <span><b>A/D</b> STRAFE</span>
        <span><b>MOUSE</b> 3D STEER / AIM</span>
        <span><b>E</b> HOLD BEAM</span>
        <span><b>Q</b> LASER</span>
        <span><b>SPACE</b> TURBO</span>
      </div>
    </div>
  )
}

function Results() {
  const { snapshot, restart } = useGame()
  return (
    <div className={`overlay results-overlay ${snapshot.victory ? 'victory' : 'defeat'}`}>
      <span className="eyebrow">{snapshot.victory ? 'RAID FILED AS A SUCCESS' : 'VEHICLE SEIZED BY CITY'}</span>
      <h2>{snapshot.resultTitle}</h2>
      <strong className="final-score">{snapshot.score.toLocaleString()}</strong>
      <p>FINAL INFAMY SCORE</p>
      <div className="result-stats">
        <span><b>{snapshot.completedMissions}</b> MISSIONS</span>
        <span><b>{snapshot.maxWanted}★</b> MAX HEAT</span>
        <span><b>{snapshot.fightersDown}</b> FIGHTERS</span>
        <span><b>x{snapshot.chain}</b> CHAIN</span>
      </div>
      <button className="primary-button" onClick={restart}>RAID AGAIN</button>
    </div>
  )
}

function CaptiveRack() {
  const { snapshot } = useGame()
  return (
    <div className="captive-rack">
      <span className="eyebrow">TETHERED</span>
      <div>
        {snapshot.carried.length === 0 && <small>EMPTY</small>}
        {snapshot.carried.map((item) => <i key={item.id}>{item.kind === 'cow' ? '🐄' : '●'}</i>)}
      </div>
    </div>
  )
}

export function Hud() {
  const { snapshot } = useGame()
  if (snapshot.phase === 'intro') return <Intro />
  const activeTarget = snapshot.mission.targets.find((target) => target.id === snapshot.beamTargetId)
  const missionTotal = snapshot.mission.targets.length
  const missionProgress = ((snapshot.mission.completed + (activeTarget?.progress ?? 0)) / missionTotal) * 100
  const beamStatus = snapshot.beamActive
    ? activeTarget ? `LOCKED · ${Math.round(activeTarget.progress * 100)}%` : 'SEARCHING'
    : snapshot.beamAvailable ? 'READY' : 'OUT OF RANGE'
  return (
    <>
      <div className="hud">
        <section className="mission-card panel">
          <span className="eyebrow">CURRENT CRIME · {snapshot.mission.kind.toUpperCase()}</span>
          <strong>{snapshot.mission.title}</strong>
          <p>{snapshot.mission.briefing}</p>
          <div className="mission-progress"><i style={{ width: `${missionProgress}%` }} /></div>
          <small>{snapshot.mission.completed}/{missionTotal} TARGETS</small>
        </section>

        <WantedStars />

        <section className="score-card panel">
          <span className="eyebrow">INFAMY</span>
          <strong>{snapshot.score.toLocaleString()}</strong>
          <div><b>x{snapshot.chain}</b> CHAIN <small>{snapshot.chainWindow > 0 ? `${snapshot.chainWindow.toFixed(1)}s` : 'COLD'}</small></div>
          <time>{formatTime(snapshot.sessionTime)}</time>
        </section>

        <div className="hud-center">
          {snapshot.fiveStarTimer !== null && <div className="survive-banner">SURVIVE · {snapshot.fiveStarTimer.toFixed(1)}</div>}
          {snapshot.message && <div className="message">{snapshot.message}</div>}
        </div>

        <section className="systems-panel panel">
          <div className="shield-row">
            <span className="eyebrow">SHIELD</span>
            {Array.from({ length: 3 }, (_, index) => <i key={index} data-active={index < snapshot.health}>◆</i>)}
          </div>
          <div className="system-meter" data-active={snapshot.boostActive}>
            <span>SPACE · TURBO <b>{snapshot.boostActive ? 'ACTIVE' : `${Math.round(snapshot.turbo * 100)}%`}</b></span>
            <div><i style={{ width: `${snapshot.turbo * 100}%` }} /></div>
          </div>
          <div className="beam-readout" data-active={snapshot.beamActive} data-error={!snapshot.beamAvailable}>
            <span>E · BEAM</span><b>{beamStatus}</b>
          </div>
        </section>

        <section className="flight-card panel">
          <div><span className="eyebrow">SPEED</span><strong>{Math.round(snapshot.speed * 3.6)}</strong><small>KM/H</small></div>
          <div><span className="eyebrow">ALT</span><strong>{snapshot.height.toFixed(1)}</strong><small>M</small></div>
          <div><span className="eyebrow">FIGHTERS</span><strong>{snapshot.activeFighters}</strong><small>/3</small></div>
        </section>
        <CaptiveRack />
        <div
          className="reticle"
          style={{ left: `${50 + snapshot.aimX * 38}%`, top: `${50 + snapshot.aimY * 34}%` }}
        ><i /><i /></div>
      </div>
      <MobileControls />
      {snapshot.phase === 'results' && <Results />}
    </>
  )
}

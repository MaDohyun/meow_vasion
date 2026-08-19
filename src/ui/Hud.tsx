import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useGame } from '../GameContext'
import { WORLD_REMOVE_RADIUS } from '../core/world'
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
      <strong className="risk-multiplier">RISK ×{snapshot.riskMultiplier.toFixed(2)}</strong>
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
        <span><b>A/D</b> RIGHT / LEFT</span>
        <span><b>MOUSE</b> 3D STEER / AIM</span>
        <span><b>E</b> HOLD TRACTOR BEAM</span>
        <span><b>Q</b> TAP LASER</span>
        <span><b>SPACE + E</b> AMPLIFIED BEAM</span>
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
      <strong className="final-score">{Math.floor(snapshot.score).toLocaleString()}</strong>
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
        {snapshot.carried.map((item) => <i key={item.id}>{item.kind === 'cat' ? '🐈' : '●'}</i>)}
      </div>
    </div>
  )
}

function PlanetRadar() {
  const { runtime, snapshot } = useGame()
  const target = snapshot.mission.targets.find((item) => item.active)
  const place = (x: number, z: number) => ({
    left: `${50 + Math.max(-1, Math.min(1, (x - snapshot.position.x) / WORLD_REMOVE_RADIUS)) * 46}%`,
    top: `${50 + Math.max(-1, Math.min(1, (z - snapshot.position.z) / WORLD_REMOVE_RADIUS)) * 46}%`,
  })
  return (
    <div className="planet-radar" aria-label="local procedural city radar">
      <span className="radar-label">LOCAL GRID · LIVE</span>
      <i className="radar-orbit" />
      {runtime.current.world.buildings.map((building) => (
        <i key={building.id} className="district-dot" style={place(building.position.x, building.position.z)} />
      ))}
      {target && <i className="target-dot" style={place(target.position.x, target.position.z)} />}
      <i className="player-dot" style={{ left: '50%', top: '50%' }} />
    </div>
  )
}

export function Hud() {
  const { snapshot } = useGame()
  if (snapshot.phase === 'intro') return <Intro />
  const activeTarget = snapshot.mission.targets[0]
  const missionTotal = snapshot.mission.targets.length
  const missionProgress = ((snapshot.mission.completed + (activeTarget?.progress ?? 0)) / missionTotal) * 100
  const beamStatus = snapshot.beamActive
    ? [
        snapshot.beamTargetId && activeTarget ? `LOCK ${Math.round(activeTarget.progress * 100)}%` : null,
        snapshot.beamObjectCount > 0 ? `PULLING ${snapshot.beamObjectCount}` : null,
        snapshot.boostActive ? 'AMPLIFIED' : null,
      ].filter(Boolean).join(' · ') || 'SEARCHING'
    : 'READY'
  return (
    <>
      <div className="hud">
        <section className="mission-card panel">
          <span className="eyebrow">CURRENT CRIME · {snapshot.mission.kind.toUpperCase()}</span>
          <strong>{snapshot.mission.title}</strong>
          <p>{snapshot.mission.briefing}</p>
          <div className="mission-progress"><i style={{ width: `${missionProgress}%` }} /></div>
          <small>{snapshot.mission.completed}/{missionTotal} OBJECTIVE</small>
        </section>

        <WantedStars />

        <section className="score-card panel">
          <span className="eyebrow">INFAMY</span>
          <strong>{Math.floor(snapshot.score).toLocaleString()}</strong>
          <div><b>×{(snapshot.chain * snapshot.riskMultiplier).toFixed(2)}</b> TOTAL <small>CHAIN ×{snapshot.chain}</small></div>
          <time>RUN {formatTime(snapshot.sessionTime)}</time>
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
        </section>

        <section className="flight-card panel">
          <div><span className="eyebrow">SPEED</span><strong>{Math.round(snapshot.speed * 3.6)}</strong><small>KM/H</small></div>
          <div><span className="eyebrow">ALT</span><strong>{snapshot.height.toFixed(1)}</strong><small>M</small></div>
          <div><span className="eyebrow">FIGHTERS</span><strong>{snapshot.activeFighters}</strong><small>/3</small></div>
        </section>
        <section className="pilot-card panel" data-expression={snapshot.pilotExpression} aria-label={`pilot expression ${snapshot.pilotExpression}`}>
          <div className="pilot-portrait" style={pilotFrameStyle(snapshot.pilotExpression)} />
          <div><span className="eyebrow">PILOT CAM</span><b>{snapshot.pilotExpression.toUpperCase()}</b></div>
        </section>
        <CaptiveRack />
        <PlanetRadar />
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

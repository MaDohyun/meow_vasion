import { useEffect, useRef, useState } from 'react'
import { useGame } from '../GameContext'
import { RichText } from './RichText'

/**
 * The lobby's control briefing.
 *
 * The diagrams are drawn rather than shipped as another image. That keeps
 * the captions translatable and preserves the project's asset budget while
 * the screen still shares the generated lobby art behind its console.
 */

type Mood = 'neutral' | 'angry' | 'happy'

/** The cat-bot saucer, drawn around the centre of its hull so a panel can
 *  place it with one transform. About 114 wide and 68 tall at scale 1.
 *
 *  Order matters: the dome and ears go down first and the hull over them, so
 *  the hull's front edge hides where the dome joins it. That also keeps the
 *  face clear of the hull - it is the only part small enough to read badly
 *  if it were clipped. */
function Saucer({ mood = 'neutral' }: { mood?: Mood }) {
  return (
    <g>
      <path d="M0 -36 L0 -49" stroke="#2b4a44" strokeWidth="3" strokeLinecap="round" />
      <circle cx="0" cy="-53" r="5" fill="#f08a3c" stroke="#2b4a44" strokeWidth="2" />
      <path d="M-25 -24 L-32 -43 L-10 -32 Z" fill="#4f9b84" stroke="#2b4a44" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M25 -24 L32 -43 L10 -32 Z" fill="#4f9b84" stroke="#2b4a44" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M-31 -6 A31 30 0 0 1 31 -6 Z" fill="#5aa98f" stroke="#2b4a44" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="-21" y="-33" width="42" height="18" rx="8" fill="#111c28" stroke="#2b4a44" strokeWidth="2" />
      <Eyes mood={mood} />
      <ellipse cx="0" cy="0" rx="57" ry="15" fill="#6bbb9d" stroke="#2b4a44" strokeWidth="2.5" />
      <path d="M-57 0 A57 15 0 0 0 57 0 Z" fill="#4f9b84" />
      {[-40, -20, 0, 20, 40].map((x) => (
        <circle key={x} cx={x} cy={Math.abs(x) === 40 ? 5 : Math.abs(x) === 20 ? 8 : 9} r="4.5" fill="#f08a3c" stroke="#2b4a44" strokeWidth="1.6" />
      ))}
      <g transform="translate(-27 -4) scale(.85)">
        <polygon points="0,-7 2,-2.2 7,-2.2 3,1 4.4,6 0,3 -4.4,6 -3,1 -7,-2.2 -2,-2.2" fill="#ffe05f" stroke="#2b4a44" strokeWidth="1.4" strokeLinejoin="round" />
      </g>
    </g>
  )
}

function Eyes({ mood }: { mood: Mood }) {
  if (mood === 'angry') {
    return (
      <g fill="#64f1ee">
        <polygon points="-15,-29 -4,-25 -4,-20 -15,-23" />
        <polygon points="15,-29 4,-25 4,-20 15,-23" />
      </g>
    )
  }
  if (mood === 'happy') {
    return (
      <g stroke="#64f1ee" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M-15 -22 q5.5 -8 11 0" />
        <path d="M4 -22 q5.5 -8 11 0" />
      </g>
    )
  }
  return (
    <g fill="#64f1ee">
      <rect x="-14" y="-28" width="7" height="9" rx="3.2" />
      <rect x="7" y="-28" width="7" height="9" rx="3.2" />
    </g>
  )
}

/**
 * Panel one: the saucer flying itself towards the reticle.
 *
 * It used to be four arrows around a crosshair, one per WASD key. There are no
 * keys to draw now - the craft is always going, and the only thing the player
 * does is put the reticle somewhere. So the picture is a trail already flown,
 * a ship, and the mark it is heading for.
 */
function MoveArt() {
  return (
    <svg className="howto-art" viewBox="0 0 320 170" role="img" aria-hidden="true">
      {/* Behind it: the way it came, which nobody had to hold a key for. */}
      <path
        d="M18 142 C72 142 96 122 116 104"
        fill="none"
        stroke="#e9e7d6"
        strokeWidth="3"
        strokeDasharray="7 6"
        strokeLinecap="round"
        opacity=".5"
      />
      <g transform="translate(142 90) scale(.5)"><Saucer /></g>
      {/* Ahead of it: where the reticle is, which is the whole of steering. */}
      <polyline points="176,80 224,60" fill="none" stroke="#e9e7d6" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" />
      <polygon points="236,54 225.8,65.8 220.4,53" fill="#e9e7d6" />
      <g transform="translate(264 44)">
        <circle r="17" fill="none" stroke="#ff5f7c" strokeWidth="3" />
        <path d="M0 -25 V-11 M0 11 V25 M-25 0 H-11 M11 0 H25" stroke="#ff5f7c" strokeWidth="3" strokeLinecap="round" />
        <circle r="3.4" fill="#ff5f7c" />
      </g>
    </svg>
  )
}

/** Panel two: the hitscan laser, drawn from muzzle to the mark it lands on. */
function LaserArt() {
  return (
    <svg className="howto-art" viewBox="0 0 320 170" role="img" aria-hidden="true">
      <g transform="translate(98 92) scale(.66)"><Saucer mood="angry" /></g>
      <g transform="translate(258 90)">
        <rect x="-26" y="-46" width="52" height="76" rx="12" fill="#d8d6cc" stroke="#2b3040" strokeWidth="3" />
        <rect x="-16" y="34" width="32" height="8" rx="4" fill="#9a9a96" stroke="#2b3040" strokeWidth="2.5" />
        <circle cx="0" cy="-6" r="16" fill="none" stroke="#ff5f7c" strokeWidth="5" />
        <circle cx="0" cy="-6" r="7" fill="#ff5f7c" />
      </g>
      <path d="M146 88 L232 86" stroke="rgba(255,95,124,.35)" strokeWidth="14" strokeLinecap="round" />
      <path d="M146 88 L232 86" stroke="#ffd9dd" strokeWidth="5" strokeLinecap="round" />
      <g stroke="#ffe05f" strokeWidth="3" strokeLinecap="round">
        <path d="M240 84 L254 84 M236 72 L246 64 M236 96 L246 104" />
      </g>
    </svg>
  )
}

/** Panel three: the tractor beam and the sort of thing it lifts. */
function BeamArt() {
  return (
    <svg className="howto-art" viewBox="0 0 320 170" role="img" aria-hidden="true">
      <polygon points="60,66 126,66 302,132 198,162" fill="rgba(183,255,99,.28)" stroke="rgba(183,255,99,.6)" strokeWidth="2.5" strokeLinejoin="round" />
      <g transform="translate(93 60) scale(.6)"><Saucer /></g>
      <g transform="translate(196 108)">
        <polygon points="0,-15 15,-4 8,14 -8,14 -15,-4" fill="#7558aa" stroke="#2b2340" strokeWidth="2.5" strokeLinejoin="round" />
      </g>
      <g transform="translate(238 120)">
        <circle r="13" fill="#c9cbd0" stroke="#2b3040" strokeWidth="2.5" />
        <circle r="4.5" fill="#5c6270" />
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <rect key={angle} x="-3" y="-19" width="6" height="7" fill="#c9cbd0" stroke="#2b3040" strokeWidth="2" transform={`rotate(${angle})`} />
        ))}
      </g>
      <g transform="translate(276 128) rotate(-14)">
        <rect x="-19" y="-11" width="38" height="22" rx="4" fill="#2f3542" stroke="#2b3040" strokeWidth="2.5" />
        <rect x="19" y="-5" width="6" height="10" rx="2" fill="#b7ff63" stroke="#2b3040" strokeWidth="2" />
        <polygon points="-3,-7 4,-1 0,-1 3,7 -4,1 0,1" fill="#ffe05f" />
      </g>
      <g stroke="#b7ff63" strokeWidth="3" strokeLinecap="round" opacity=".85">
        <path d="M160 99 L160 111 M154 105 L166 105" />
        <path d="M215 135 L215 145 M210 140 L220 140" />
        <path d="M250 140 L250 150 M245 145 L255 145" />
      </g>
    </svg>
  )
}

/** Panel four: the turbo burst, all streaks and a very pleased pilot. */
function TurboArt() {
  return (
    <svg className="howto-art" viewBox="0 0 320 170" role="img" aria-hidden="true">
      <g strokeLinecap="round">
        <path d="M30 56 L150 56" stroke="rgba(100,241,238,.5)" strokeWidth="7" />
        <path d="M8 76 L132 76" stroke="rgba(190,235,255,.7)" strokeWidth="10" />
        <path d="M22 98 L146 98" stroke="rgba(100,241,238,.42)" strokeWidth="6" />
        <path d="M48 118 L158 118" stroke="rgba(190,235,255,.4)" strokeWidth="8" />
      </g>
      <g transform="translate(198 100) scale(.72)"><Saucer mood="happy" /></g>
      <g transform="translate(232 26) scale(.9)">
        <polygon points="0,-11 3.2,-3.4 11,-3.4 4.8,1.6 7,9.4 0,4.6 -7,9.4 -4.8,1.6 -11,-3.4 -3.2,-3.4" fill="#ffe05f" stroke="#2b4a44" strokeWidth="1.6" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

function MouseGlyph() {
  return (
    <svg className="howto-mouse" viewBox="0 0 22 30" role="img" aria-hidden="true">
      <rect x="1.5" y="1.5" width="19" height="27" rx="9.5" fill="#efeade" stroke="#2b3040" strokeWidth="2.5" />
      <path d="M2 12 H20 M11 2 V12" stroke="#2b3040" strokeWidth="2" />
      <path d="M2.4 8 A9 9 0 0 1 11 2 V12 H2 Z" fill="#ff5f7c" />
    </svg>
  )
}

export function HowToPlay({ onClose }: { onClose: () => void }) {
  const { t } = useGame()
  const cardRef = useRef<HTMLDivElement>(null)
  const [scrollThumb, setScrollThumb] = useState({ top: 0, height: 100 })

  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const updateThumb = () => {
      const height = Math.min(100, (card.clientHeight / card.scrollHeight) * 100)
      const progress = card.scrollHeight === card.clientHeight
        ? 0
        : card.scrollTop / (card.scrollHeight - card.clientHeight)
      setScrollThumb({ top: progress * (100 - height), height })
    }
    updateThumb()
    window.addEventListener('resize', updateThumb)
    return () => window.removeEventListener('resize', updateThumb)
  }, [])

  return (
    <div className="overlay howto-overlay" role="dialog" aria-modal="true" aria-labelledby="howto-title">
      <div className="howto-card-shell panel">
        <div ref={cardRef} className="howto-card" onScroll={() => {
          const card = cardRef.current
          if (!card) return
          const height = Math.min(100, (card.clientHeight / card.scrollHeight) * 100)
          const progress = card.scrollHeight === card.clientHeight
            ? 0
            : card.scrollTop / (card.scrollHeight - card.clientHeight)
          setScrollThumb({ top: progress * (100 - height), height })
        }}>
          <span className="howto-eyebrow">CAT FLEET // FIELD MANUAL</span>
          <h2 className="howto-title" id="howto-title">{t.howToTitle}</h2>
          <div className="howto-panels">
            <figure className="howto-panel">
              <i className="howto-step">1</i>
              <MoveArt />
              <figcaption>
                <b className="keycap keycap-wide">AUTO</b>
                <span>{t.howToMove}</span>
                <em className="howto-divider" />
                <MouseGlyph />
                <span>{t.howToAim}</span>
              </figcaption>
            </figure>
            <figure className="howto-panel">
              <i className="howto-step">2</i>
              <LaserArt />
              <figcaption>
                <span className="keycap-set"><b className="keycap keycap-wide">{t.keyLeftClick}</b><b className="keycap">Q</b></span>
                <span>{t.controlLaser}</span>
              </figcaption>
            </figure>
            <figure className="howto-panel">
              <i className="howto-step">3</i>
              <BeamArt />
              <figcaption>
                <span className="keycap-set"><b className="keycap keycap-wide">{t.keyRightClick}</b><b className="keycap">W</b></span>
                <span>{t.beam}</span>
              </figcaption>
            </figure>
            <figure className="howto-panel">
              <i className="howto-step">4</i>
              <TurboArt />
              <figcaption><b className="keycap keycap-wide">SPACE</b><span>{t.turbo}</span></figcaption>
            </figure>
          </div>
          <div className="controls-card howto-keys">
            <span><b>AUTO</b> {t.controlFly}</span>
            <span><b>MOUSE</b> {t.controlAim}</span>
            <span><b>{t.keyRightClick} / W</b> {t.controlBeam}</span>
            <span><b>{t.keyLeftClick} / Q</b> {t.controlLaser} · {t.hold}</span>
            <span><b>SPACE</b> {t.controlBoost}</span>
          </div>
          {/* The two things no panel above can draw: flying into the city hurts,
              and a full beam sinks you. Both belong in the manual, because both
              are learned the expensive way otherwise. Neither ends the run - the
              overload crash is gone - but a craft scraping the road with a full
              gauge is still a craft in trouble. */}
          <div className="howto-hazards">
            <span><i aria-hidden="true">!</i><RichText text={t.hazardBuildings} /></span>
            <span><i aria-hidden="true">!</i><RichText text={t.overloadHint} /></span>
          </div>
          <button className="primary-button" onClick={onClose}>{t.close}</button>
        </div>
        <div className="howto-scrollbar" aria-hidden="true">
          <i style={{ top: `${scrollThumb.top}%`, height: `${scrollThumb.height}%` }} />
        </div>
      </div>
    </div>
  )
}

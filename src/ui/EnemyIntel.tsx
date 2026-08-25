import { useEffect, useRef, useState, type ComponentType } from 'react'
import { enemyLaunchSeconds, type EnemyKind } from '../core/enemies'
import { useGame } from '../GameContext'

const ENEMY_ORDER: readonly EnemyKind[] = ['drone', 'helicopter', 'fighter', 'boss']

function formatLaunchTime(seconds: number | null) {
  const safe = Math.max(0, seconds ?? 0)
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

function IntelGrid() {
  return (
    <g opacity=".14" stroke="#64f1ee" strokeWidth="1">
      {[24, 64, 104, 144, 184, 224, 264, 304].map((x) => <path key={`x${x}`} d={`M${x} 10 V170`} />)}
      {[22, 62, 102, 142].map((y) => <path key={`y${y}`} d={`M8 ${y} H312`} />)}
    </g>
  )
}

function DroneArt({ label }: { label: string }) {
  return (
    <svg className="enemy-intel-art" viewBox="0 0 320 180" role="img" aria-label={label}>
      <IntelGrid />
      <circle cx="160" cy="90" r="67" fill="rgba(255,95,124,.07)" stroke="#ff5f7c" strokeWidth="2" strokeDasharray="7 6" />
      <circle cx="160" cy="90" r="55" fill="none" stroke="rgba(255,95,124,.42)" strokeWidth="1.5" />
      <g transform="translate(160 77)">
        <path d="M-67 0 H67 M0 -55 V55" stroke="#596273" strokeWidth="10" strokeLinecap="square" />
        {[[ -68, 0 ], [68, 0], [0, -56], [0, 56]].map(([x, y], index) => (
          <g key={index} transform={`translate(${x} ${y})`}>
            <circle r="15" fill="#d4a24b" stroke="#fff5c7" strokeWidth="2" />
            <path d="M-24 0 H24 M0 -9 V9" stroke="#29233f" strokeWidth="4" strokeLinecap="round" />
          </g>
        ))}
        <circle r="17" fill="#4b5362" stroke="#fff5c7" strokeWidth="2.5" />
        <path d="M-15 14 L-12 47 Q0 63 12 47 L15 14 Z" fill="#7e3a4b" stroke="#fff5c7" strokeWidth="2.5" />
        <circle cy="13" r="6" fill="#ff4a5c" stroke="#fff5c7" strokeWidth="2" />
      </g>
      <g fill="#ff5f7c">
        <path d="M62 31 H86 V35 H66 V55 H62 Z" />
        <path d="M258 31 H234 V35 H254 V55 H258 Z" />
        <path d="M62 149 H86 V145 H66 V125 H62 Z" />
        <path d="M258 149 H234 V145 H254 V125 H258 Z" />
      </g>
    </svg>
  )
}

function HelicopterArt({ label }: { label: string }) {
  return (
    <svg className="enemy-intel-art" viewBox="0 0 320 180" role="img" aria-label={label}>
      <IntelGrid />
      <g opacity=".42" stroke="#ff5f7c" strokeWidth="4" strokeLinecap="round">
        <path d="M28 71 H91" /><path d="M16 90 H73" /><path d="M38 109 H96" />
      </g>
      <g transform="translate(176 90)">
        <path d="M-60 5 Q-50 -29 -8 -33 Q30 -33 50 -5 Q38 29 -5 33 H-39 Q-58 25 -60 5 Z" fill="#6f608b" stroke="#fff5c7" strokeWidth="3" />
        <path d="M-20 -29 Q13 -34 36 -8 L-9 -8 Z" fill="#8ed8df" stroke="#29233f" strokeWidth="2.5" />
        <path d="M-49 2 L-116 -17 L-118 -5 L-57 18 Z" fill="#5a526c" stroke="#fff5c7" strokeWidth="3" strokeLinejoin="round" />
        <path d="M-111 -13 L-130 -39 L-118 -42 L-100 -16 Z" fill="#5a526c" stroke="#fff5c7" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="-121" cy="-24" r="18" fill="none" stroke="#332f45" strokeWidth="4" />
        <path d="M-140 -24 H-102 M-121 -43 V-5" stroke="#d4a24b" strokeWidth="4" strokeLinecap="round" />
        <path d="M-12 -34 V-49 M-104 -50 H84" stroke="#332f45" strokeWidth="5" strokeLinecap="round" />
        <circle cy="-50" r="6" fill="#d4a24b" />
        <path d="M-32 32 L-45 45 M24 29 L35 44 M-55 46 H49" fill="none" stroke="#332f45" strokeWidth="5" strokeLinecap="round" />
        <circle cx="43" cy="12" r="5" fill="#ff5f7c" />
      </g>
      <g transform="translate(282 90)" stroke="#ff5f7c" strokeWidth="3" fill="none">
        <circle r="18" /><path d="M0 -27 V-12 M0 12 V27 M-27 0 H-12 M12 0 H27" />
      </g>
    </svg>
  )
}

function FighterArt({ label }: { label: string }) {
  return (
    <svg className="enemy-intel-art" viewBox="0 0 320 180" role="img" aria-label={label}>
      <IntelGrid />
      <g transform="translate(130 90) rotate(90)">
        <path d="M-66 0 Q-36 -12 39 -10 L67 0 L39 10 Q-36 12 -66 0 Z" fill="#e9e1da" stroke="#29233f" strokeWidth="3" />
        <path d="M-13 -8 L31 -67 L44 -63 L25 -7 Z M-13 8 L31 67 L44 63 L25 7 Z" fill="#cf7087" stroke="#29233f" strokeWidth="3" strokeLinejoin="round" />
        <path d="M35 -8 L55 -31 L64 -28 L54 -5 Z M35 8 L55 31 L64 28 L54 5 Z" fill="#76628f" stroke="#29233f" strokeWidth="3" />
        <ellipse cx="-28" cy="0" rx="19" ry="7" fill="#77dce8" stroke="#29233f" strokeWidth="2.5" />
        <path d="M54 -3 H75 M54 3 H75" stroke="#ffe05f" strokeWidth="4" strokeLinecap="round" />
      </g>
      <g transform="translate(259 91)">
        <path d="M-62 0 H-17" stroke="rgba(255,95,124,.36)" strokeWidth="14" strokeLinecap="round" />
        <path d="M-62 0 H-17" stroke="#ffb0bd" strokeWidth="4" strokeLinecap="round" />
        <circle r="13" fill="#ff5f7c" stroke="#fff5c7" strokeWidth="3" />
        <circle r="5" fill="#fff5c7" />
      </g>
    </svg>
  )
}

function BattleshipArt({ label }: { label: string }) {
  return (
    <svg className="enemy-intel-art enemy-intel-art-unknown" viewBox="0 0 320 180" role="img" aria-label={label}>
      <IntelGrid />
      <g opacity=".32" fill="none" stroke="#ff5f7c" strokeWidth="2">
        <ellipse cx="160" cy="90" rx="132" ry="68" strokeDasharray="5 8" />
        <ellipse cx="160" cy="90" rx="106" ry="50" strokeDasharray="3 9" />
      </g>
      <g className="enemy-intel-shadow" transform="translate(160 95)">
        <path d="M-122 3 L-88 -26 L68 -30 L124 -5 L85 26 L-91 29 Z" fill="#01040a" stroke="rgba(255,245,199,.22)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M-32 -29 L-18 -55 L31 -57 L48 -31 Z" fill="#01040a" stroke="rgba(255,245,199,.18)" strokeWidth="3" />
        <path d="M-4 -56 V-76 M-21 -73 H14" stroke="#01040a" strokeWidth="10" strokeLinecap="square" />
        {[-75, -40, 6, 47, 79].map((x) => <path key={x} d={`M${x} -24 V-43 H${x + 17} V-24`} fill="#01040a" stroke="#01040a" strokeWidth="7" />)}
        <path d="M-95 28 L-70 43 H64 L91 25" fill="#01040a" stroke="#01040a" strokeWidth="7" />
      </g>
      <text x="160" y="119" textAnchor="middle" fill="#ffe05f" stroke="#29233f" strokeWidth="5" paintOrder="stroke" fontFamily="Impact, Arial Black, sans-serif" fontSize="88">?</text>
      <path d="M38 27 H73 M247 27 H282 M38 153 H73 M247 153 H282" stroke="#ffe05f" strokeWidth="4" />
    </svg>
  )
}

const ENEMY_ART: Record<EnemyKind, ComponentType<{ label: string }>> = {
  drone: DroneArt,
  helicopter: HelicopterArt,
  fighter: FighterArt,
  boss: BattleshipArt,
}

export function EnemyIntel({ onClose }: { onClose: () => void }) {
  const { t } = useGame()
  const cardRef = useRef<HTMLDivElement>(null)
  const [scrollThumb, setScrollThumb] = useState({ top: 0, height: 100 })

  const updateThumb = () => {
    const card = cardRef.current
    if (!card) return
    const height = Math.min(100, (card.clientHeight / card.scrollHeight) * 100)
    const progress = card.scrollHeight === card.clientHeight
      ? 0
      : card.scrollTop / (card.scrollHeight - card.clientHeight)
    setScrollThumb({ top: progress * (100 - height), height })
  }

  useEffect(() => {
    updateThumb()
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('resize', updateThumb)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('resize', updateThumb)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return (
    <div className="overlay enemy-intel-overlay" role="dialog" aria-modal="true" aria-labelledby="enemy-intel-title">
      <div className="enemy-intel-shell panel">
        <div ref={cardRef} className="enemy-intel-body" onScroll={updateThumb}>
          <span className="enemy-intel-eyebrow">{t.enemyIntelEyebrow}</span>
          <h2 id="enemy-intel-title">{t.enemyIntelTitle}</h2>
          <p className="enemy-intel-lead">{t.enemyIntelLead}</p>
          <div className="enemy-intel-grid">
            {ENEMY_ORDER.map((kind, index) => {
              const Art = ENEMY_ART[kind]
              return (
                <article className="enemy-intel-entry" key={kind} data-kind={kind}>
                  <div className="enemy-intel-visual">
                    <span className="enemy-intel-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <Art label={t.enemyIntelNames[kind]} />
                  </div>
                  <div className="enemy-intel-copy">
                    <div className="enemy-intel-heading">
                      <h3>{t.enemyIntelNames[kind]}</h3>
                      <span><i aria-hidden="true" />{t.enemyIntelAppears} <b>T+{formatLaunchTime(enemyLaunchSeconds(kind))}</b></span>
                    </div>
                    <p>{t.enemyIntelCopy[kind]}</p>
                  </div>
                </article>
              )
            })}
          </div>
          <button className="primary-button" type="button" onClick={onClose}>{t.close}</button>
        </div>
        <div className="enemy-intel-scrollbar" aria-hidden="true">
          <i style={{ top: `${scrollThumb.top}%`, height: `${scrollThumb.height}%` }} />
        </div>
      </div>
    </div>
  )
}

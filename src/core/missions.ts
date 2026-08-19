import type { Vec3 } from './drone'

export type MissionKind = 'cat-abduct' | 'human-abduct' | 'car-airshow' | 'enemy-takedown'
export type TargetKind = 'cat' | 'pedestrian' | 'car' | 'enemy'

export type MissionTarget = {
  id: string
  label: string
  kind: TargetKind
  position: Vec3
  color: string
  progress: number
  active: boolean
}

export type Mission = {
  id: number
  kind: MissionKind
  title: string
  briefing: string
  completed: number
  targets: MissionTarget[]
}

export type MissionCandidate = {
  id: string
  kind: TargetKind
  position: Vec3
  label?: string
  color?: string
}

export const MISSION_TARGET_RADIUS = 95
export const AIRSHOW_ALTITUDE = 11
export const AIRSHOW_HOLD_TIME = 2.4

const MISSION_ORDER: MissionKind[] = ['cat-abduct', 'human-abduct', 'car-airshow', 'enemy-takedown']

function targetKindForMission(kind: MissionKind): TargetKind {
  if (kind === 'cat-abduct') return 'cat'
  if (kind === 'human-abduct') return 'pedestrian'
  if (kind === 'car-airshow') return 'car'
  return 'enemy'
}

function missionCopy(index: number, kind: MissionKind, candidate: MissionCandidate): Mission {
  const presentation = kind === 'cat-abduct'
    ? { title: 'CAT BURGLAR', briefing: 'TRACK THE RUNAWAY CAT · HOLD E', color: '#ffd36f', label: 'RUNAWAY CAT' }
    : kind === 'human-abduct'
      ? { title: 'HUMAN SAMPLE', briefing: 'BEAM UP THE MARKED PEDESTRIAN', color: '#ff83bd', label: 'HUMAN SAMPLE' }
      : kind === 'car-airshow'
        ? { title: 'CAR AIRSHOW', briefing: `HOLD THE CAR ABOVE ${AIRSHOW_ALTITUDE}M`, color: '#73efff', label: 'SHOW CAR' }
        : { title: 'ENEMY TAKEDOWN', briefing: 'DESTROY THE MARKED HOSTILE · Q', color: '#ff5d7f', label: 'HOSTILE' }
  return {
    id: index,
    kind,
    title: presentation.title,
    briefing: presentation.briefing,
    completed: 0,
    targets: [{
      id: candidate.id,
      label: candidate.label ?? presentation.label,
      kind: candidate.kind,
      position: { ...candidate.position },
      color: candidate.color ?? presentation.color,
      progress: 0,
      active: true,
    }],
  }
}

export function selectMission(
  index: number,
  origin: Pick<Vec3, 'x' | 'z'>,
  candidates: MissionCandidate[],
  wanted: number,
) {
  for (let offset = 0; offset < MISSION_ORDER.length; offset += 1) {
    const kind = MISSION_ORDER[(index + offset) % MISSION_ORDER.length]!
    if (kind === 'enemy-takedown' && wanted < 1) continue
    const targetKind = targetKindForMission(kind)
    let nearest: MissionCandidate | null = null
    let nearestDistance = MISSION_TARGET_RADIUS
    for (const candidate of candidates) {
      if (candidate.kind !== targetKind) continue
      const distance = Math.hypot(candidate.position.x - origin.x, candidate.position.z - origin.z)
      if (distance <= nearestDistance) {
        nearest = candidate
        nearestDistance = distance
      }
    }
    if (nearest) return missionCopy(index, kind, nearest)
  }
  return null
}

export function nearestBeamTarget(mission: Mission, position: Vec3, maxHorizontalDistance = 8.5, maxVerticalDrop = 10) {
  const candidate = mission.targets[0]
  if (!candidate?.active || candidate.kind === 'enemy') return null
  const verticalGap = position.y - candidate.position.y
  if (verticalGap < -0.5 || verticalGap > maxVerticalDrop) return null
  const distance = Math.hypot(position.x - candidate.position.x, position.z - candidate.position.z)
  return distance <= maxHorizontalDistance ? candidate : null
}

export function channelTarget(mission: Mission, targetId: string, seconds: number) {
  const target = mission.targets[0]
  if (!target || !target.active || target.id !== targetId || (target.kind !== 'cat' && target.kind !== 'pedestrian')) {
    return { target: null, completed: false }
  }
  const channelTime = target.kind === 'cat' ? 1.15 : 0.82
  target.progress = Math.min(1, target.progress + seconds / channelTime)
  const completed = target.progress >= 1
  if (completed) completeTarget(mission, target)
  return { target, completed }
}

export function stepAirshowMission(mission: Mission, source: { position: Vec3; inBeam: boolean }, seconds: number) {
  const target = mission.targets[0]
  if (!target || !target.active || mission.kind !== 'car-airshow' || target.id === '') return false
  target.position.x = source.position.x
  target.position.y = source.position.y
  target.position.z = source.position.z
  if (source.inBeam && source.position.y >= AIRSHOW_ALTITUDE) {
    target.progress = Math.min(1, target.progress + seconds / AIRSHOW_HOLD_TIME)
  } else {
    target.progress = Math.max(0, target.progress - seconds * 0.3)
  }
  if (target.progress < 1) return false
  completeTarget(mission, target)
  return true
}

export function completeEnemyMission(mission: Mission, targetId: string) {
  const target = mission.targets[0]
  if (!target || !target.active || mission.kind !== 'enemy-takedown' || target.id !== targetId) return false
  completeTarget(mission, target)
  return true
}

function completeTarget(mission: Mission, target: MissionTarget) {
  target.active = false
  target.progress = 1
  mission.completed = 1
}

export function isMissionComplete(mission: Mission) {
  return mission.completed === 1
}

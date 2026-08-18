import type { Vec3 } from './drone'

export type MissionKind = 'abduct' | 'scan' | 'smash'
export type TargetKind = 'cow' | 'tourist' | 'billboard' | 'patrol'

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

type TargetSeed = Omit<MissionTarget, 'id' | 'progress' | 'active'>
type MissionSeed = Omit<Mission, 'id' | 'completed' | 'targets'> & { targets: TargetSeed[] }

const target = (
  label: string,
  kind: TargetKind,
  x: number,
  y: number,
  z: number,
  color: string,
): TargetSeed => ({ label, kind, position: { x, y, z }, color })

const MISSION_SEEDS: MissionSeed[] = [
  {
    kind: 'abduct',
    title: 'CATTLE CLASSIFIED',
    briefing: 'BEAM UP 2 CITY COWS',
    targets: [
      target('MOO-01', 'cow', -4.5, 0.75, 48, '#c9ff67'),
      target('MOO-02', 'cow', 4.5, 0.75, 31, '#c9ff67'),
    ],
  },
  {
    kind: 'scan',
    title: 'SIGN LANGUAGE',
    briefing: 'SCAN 3 SUSPICIOUS SIGNS',
    targets: [
      target('ARCADE SIGN', 'billboard', 4, 3.2, -43, '#65e9ff'),
      target('DEPOT SIGN', 'billboard', 51.5, 3.2, 1, '#65e9ff'),
      target('CLINIC SIGN', 'billboard', -51.5, 3.2, 2, '#65e9ff'),
    ],
  },
  {
    kind: 'abduct',
    title: 'TOUR GROUP',
    briefing: 'COLLECT 3 VERY CALM TOURISTS',
    targets: [
      target('TOURIST A', 'tourist', -37, 0.9, -4.8, '#ff79b8'),
      target('TOURIST B', 'tourist', -24, 0.9, 4.8, '#ff79b8'),
      target('TOURIST C', 'tourist', 30, 0.9, -4.8, '#ff79b8'),
    ],
  },
  {
    kind: 'smash',
    title: 'TOW-AWAY ZONE',
    briefing: 'OVERCHARGE 2 PATROL CARS',
    targets: [
      target('PATROL 12', 'patrol', 4.5, 0.7, -33, '#ffcf55'),
      target('PATROL 07', 'patrol', -4.5, 0.7, -67, '#ffcf55'),
    ],
  },
  {
    kind: 'scan',
    title: 'FREE WIFI',
    briefing: 'SCAN THE CITY NETWORK',
    targets: [
      target('HOTEL NODE', 'billboard', -5, 3.2, -45, '#8c82ff'),
      target('VIDEO NODE', 'billboard', 5, 3.2, 41, '#8c82ff'),
      target('MARKET NODE', 'billboard', -48, 3.2, 40, '#8c82ff'),
    ],
  },
  {
    kind: 'smash',
    title: 'METER EXPIRED',
    briefing: 'FRY 3 ENFORCEMENT CARS',
    targets: [
      target('METER COP', 'patrol', 39, 0.7, 4.5, '#ff6e78'),
      target('BOOT VAN', 'patrol', 65, 0.7, -13.5, '#ff6e78'),
      target('TICKET 99', 'patrol', -64, 0.7, -15.5, '#ff6e78'),
    ],
  },
]

export const TARGET_CHANNEL_TIME: Record<TargetKind, number> = {
  cow: 0.9,
  tourist: 1.05,
  billboard: 1.25,
  patrol: 1.6,
}

export function generateMission(index: number): Mission {
  const seed = MISSION_SEEDS[((index % MISSION_SEEDS.length) + MISSION_SEEDS.length) % MISSION_SEEDS.length]!
  return {
    id: index,
    kind: seed.kind,
    title: seed.title,
    briefing: seed.briefing,
    completed: 0,
    targets: seed.targets.map((item, targetIndex) => ({
      ...item,
      id: `mission-${index}-target-${targetIndex}`,
      position: { ...item.position },
      progress: 0,
      active: true,
    })),
  }
}

export function nearestBeamTarget(mission: Mission, position: Vec3, maxHorizontalDistance = 8.5) {
  let nearest: MissionTarget | null = null
  let nearestDistance = maxHorizontalDistance
  for (const candidate of mission.targets) {
    if (!candidate.active) continue
    const verticalGap = position.y - candidate.position.y
    if (verticalGap < -0.5 || verticalGap > 10) continue
    const distance = Math.hypot(position.x - candidate.position.x, position.z - candidate.position.z)
    if (distance <= nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }
  return nearest
}

export function channelTarget(mission: Mission, targetId: string, seconds: number) {
  const target = mission.targets.find((candidate) => candidate.id === targetId && candidate.active)
  if (!target) return { target: null, completed: false }
  target.progress = Math.min(1, target.progress + seconds / TARGET_CHANNEL_TIME[target.kind])
  const completed = target.progress >= 1
  if (completed) {
    target.active = false
    mission.completed += 1
  }
  return { target, completed }
}

export function isMissionComplete(mission: Mission) {
  return mission.completed >= mission.targets.length
}

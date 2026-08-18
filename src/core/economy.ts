import type { DroneUpgrades } from './drone'

export type UpgradeId = 'motor' | 'frame' | 'magnet' | 'rack' | 'airbrake' | 'boost'

export type EconomyState = {
  credits: number
  upgrades: DroneUpgrades
  owned: UpgradeId[]
}

export const UPGRADES: Array<{
  id: UpgradeId
  name: string
  description: string
  cost: number
  color: string
}> = [
  { id: 'motor', name: 'HIGH-OUTPUT ROTOR', description: '최고속도 +12%', cost: 120, color: '#ff5b68' },
  { id: 'frame', name: 'LOW-CENTER FRAME', description: '안정도 소모 -12%', cost: 120, color: '#56d9ff' },
  { id: 'magnet', name: 'MAGNET GRIPPER', description: '충돌 낙하 -1 / 적재 -1', cost: 180, color: '#c873ff' },
  { id: 'rack', name: 'EXPANDED RACK', description: '최대 적재 +2 / 선회 저하', cost: 190, color: '#ffd45b' },
  { id: 'airbrake', name: 'AIR BRAKE', description: 'Q: 순간 제동 / 6초', cost: 220, color: '#62ff9a' },
  { id: 'boost', name: 'OVERDRIVE', description: 'Q: 3초 부스트 / 7초', cost: 240, color: '#ff7d3f' },
]

export function createEconomy(): EconomyState {
  return {
    credits: 0,
    upgrades: { speed: 0, stability: 0, rack: 0, special: 'none' },
    owned: [],
  }
}

export function rewardForDelivery(cargoCount: number, timeRatio: number, grade: 'PERFECT' | 'GOOD' | 'ROUGH') {
  const gradeMultiplier = grade === 'PERFECT' ? 1.5 : grade === 'ROUGH' ? 0.6 : 1
  return Math.round(cargoCount * 34 * (1 + Math.max(0, timeRatio) * 0.55) * gradeMultiplier)
}

export function purchaseUpgrade(state: EconomyState, id: UpgradeId): EconomyState {
  const item = UPGRADES.find((upgrade) => upgrade.id === id)
  if (!item || state.credits < item.cost || state.owned.includes(id)) return state
  const next: EconomyState = {
    credits: state.credits - item.cost,
    owned: [...state.owned, id],
    upgrades: { ...state.upgrades },
  }
  if (id === 'motor') next.upgrades.speed += 1
  if (id === 'frame') next.upgrades.stability += 1
  if (id === 'rack') next.upgrades.rack += 1
  if (id === 'airbrake') next.upgrades.special = 'airbrake'
  if (id === 'boost') next.upgrades.special = 'boost'
  return next
}

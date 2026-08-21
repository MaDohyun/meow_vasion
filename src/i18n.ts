/**
 * UI strings, in one dictionary.
 *
 * Kept together rather than scattered through components so a language can be
 * proof-read in one pass, and so a missing key is a type error at build time
 * instead of a blank label at run time - every language must supply the full
 * set, which `Record<Language, Strings>` enforces.
 *
 * Mid-run callouts are stored on the runtime as a key plus a number and
 * translated here at render time. The simulation has no business knowing what
 * language the player reads.
 *
 * Wave names ("POLICE DISPATCH" and friends) stay in English on purpose: they
 * are stylised arcade labels, closer to proper nouns than to sentences.
 */

export const LANGUAGES = ['ko', 'ja', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  ko: '한국어',
  ja: '日本語',
  en: 'English',
}

export const DEFAULT_LANGUAGE: Language = 'ko'

type Strings = {
  tagline: string
  start: string
  options: string
  close: string
  graphics: string
  qualityHigh: string
  qualityLow: string
  language: string
  weaponPicker: string
  controlFly: string
  controlStrafe: string
  controlAim: string
  controlBeam: string
  controlLaser: string
  controlDump: string
  controlBoost: string
  mass: string
  massHint: string
  collapseAt: string
  clock: string
  score: string
  wave: string
  run: string
  beam: string
  beamSearching: string
  beamReady: string
  beamLocked: string
  beamPulling: string
  beamAmplified: string
  drag: string
  dumpHint: string
  slowdown: string
  turbo: string
  turboActive: string
  auto: string
  live: string
  speed: string
  altitude: string
  threats: string
  pilotCam: string
  radar: string
  survivedTitle: string
  collapsedTitle: string
  survivedLead: string
  collapsedLead: string
  finalScore: string
  statSurvived: string
  statMass: string
  statAbsorbed: string
  statWave: string
  retry: string
  bandGround: string
  bandArmor: string
  bandAa: string
  bandGroundNote: string
  bandArmorNote: string
  bandAaNote: string
  msgRunStart: string
  msgAbsorbedPerson: (reward: number) => string
  msgAbsorbedCat: (reward: number) => string
  msgAbsorbedObject: (reward: number) => string
  msgEnemyDown: (reward: number) => string
  msgImpact: string
  msgDetonated: string
  msgCarLaunched: string
  msgDumped: (count: number) => string
  msgTurbo: string
}

/** Keys the simulation may raise as a mid-run callout. */
export type MessageKey = {
  [K in keyof Strings]: K extends `msg${string}` ? K : never
}[keyof Strings]

export function formatMessage(strings: Strings, key: MessageKey, arg: number) {
  const value = strings[key]
  return typeof value === 'function' ? value(arg) : value
}

export const STRINGS: Record<Language, Strings> = {
  ko: {
    tagline: '최대한 오래 살아남으면서 도시를 파괴하세요',
    start: '게임 시작',
    options: '옵션',
    close: '닫기',
    graphics: '그래픽',
    qualityHigh: '높음',
    qualityLow: '낮음',
    language: '언어',
    weaponPicker: '시작 무기 선택',
    controlFly: '보는 방향으로 비행',
    controlStrafe: '좌우 이동',
    controlAim: '조종 · 조준',
    controlBeam: '빔 유지 · 흡수',
    controlLaser: '레이저',
    controlDump: '매달린 짐 버리기',
    controlBoost: '터보',
    mass: '질량',
    massHint: '사람과 고양이를 흡수해 커지세요',
    collapseAt: '붕괴',
    clock: '남은 시간',
    score: '점수',
    wave: '웨이브',
    run: '경과',
    beam: '빔',
    beamSearching: '탐색 중',
    beamReady: '대기',
    beamLocked: '포착',
    beamPulling: '견인',
    beamAmplified: '증폭',
    drag: '항력',
    dumpHint: 'R로 투기',
    slowdown: '감속',
    turbo: '터보',
    turboActive: '작동',
    auto: '자동',
    live: '활성',
    speed: '속도',
    altitude: '고도',
    threats: '위협',
    pilotCam: '파일럿',
    radar: '주변 탐지 · 실시간',
    survivedTitle: '생존 성공',
    collapsedTitle: '코어 붕괴',
    survivedLead: '제한 시간을 버텨냈습니다',
    collapsedLead: '질량이 한계 아래로 떨어졌습니다',
    finalScore: '최종 점수',
    statSurvived: '생존 시간',
    statMass: '최종 질량',
    statAbsorbed: '흡수',
    statWave: '웨이브',
    retry: '다시 하기',
    bandGround: '지상 고도',
    bandArmor: '중간 고도',
    bandAa: '고공',
    bandGroundNote: '지상군 사격권',
    bandArmorNote: '전차 사격권',
    bandAaNote: '대공 미사일 사격권',
    msgRunStart: '사람을 흡수해 몸집을 키우세요',
    msgAbsorbedPerson: (reward) => `사람 흡수 · +${reward}`,
    msgAbsorbedCat: (reward) => `고양이 흡수 · +${reward}`,
    msgAbsorbedObject: (reward) => `대형 오브젝트 흡수 · +${reward}`,
    msgEnemyDown: (reward) => `적 격추 · +${reward}`,
    msgImpact: '피격 · 질량 감소',
    msgDetonated: '폭발물 기폭 · 질량 감소',
    msgCarLaunched: '자동차 파괴 · +50',
    msgDumped: (count) => `짐 투기 · ${count}개`,
    msgTurbo: '터보 가동',
  },
  ja: {
    tagline: 'できるだけ長く生き延びて街を破壊しよう',
    start: 'ゲーム開始',
    options: 'オプション',
    close: '閉じる',
    graphics: 'グラフィック',
    qualityHigh: '高',
    qualityLow: '低',
    language: '言語',
    weaponPicker: '初期武器の選択',
    controlFly: '見ている方向へ飛行',
    controlStrafe: '左右移動',
    controlAim: '操縦・照準',
    controlBeam: 'ビーム維持・吸収',
    controlLaser: 'レーザー',
    controlDump: '積荷を切り離す',
    controlBoost: 'ターボ',
    mass: '質量',
    massHint: '人と猫を吸収して大きくなろう',
    collapseAt: '崩壊',
    clock: '残り時間',
    score: 'スコア',
    wave: 'ウェーブ',
    run: '経過',
    beam: 'ビーム',
    beamSearching: '探索中',
    beamReady: '待機',
    beamLocked: '捕捉',
    beamPulling: '牽引',
    beamAmplified: '増幅',
    drag: '抗力',
    dumpHint: 'Rで投棄',
    slowdown: '減速',
    turbo: 'ターボ',
    turboActive: '作動',
    auto: '自動',
    live: '稼働',
    speed: '速度',
    altitude: '高度',
    threats: '脅威',
    pilotCam: 'パイロット',
    radar: '周辺探知・リアルタイム',
    survivedTitle: '生存成功',
    collapsedTitle: 'コア崩壊',
    survivedLead: '制限時間を耐え抜いた',
    collapsedLead: '質量が限界を下回った',
    finalScore: '最終スコア',
    statSurvived: '生存時間',
    statMass: '最終質量',
    statAbsorbed: '吸収',
    statWave: 'ウェーブ',
    retry: 'もう一度',
    bandGround: '地上高度',
    bandArmor: '中間高度',
    bandAa: '高高度',
    bandGroundNote: '地上部隊の射程',
    bandArmorNote: '戦車の射程',
    bandAaNote: '対空ミサイルの射程',
    msgRunStart: '人を吸収して巨大化しよう',
    msgAbsorbedPerson: (reward) => `人を吸収 · +${reward}`,
    msgAbsorbedCat: (reward) => `猫を吸収 · +${reward}`,
    msgAbsorbedObject: (reward) => `大型オブジェクト吸収 · +${reward}`,
    msgEnemyDown: (reward) => `敵を撃破 · +${reward}`,
    msgImpact: '被弾 · 質量減少',
    msgDetonated: '爆発物が起爆 · 質量減少',
    msgCarLaunched: '車を破壊 · +50',
    msgDumped: (count) => `積荷を投棄 · ${count}個`,
    msgTurbo: 'ターボ作動',
  },
  en: {
    tagline: 'Survive as long as you can and tear the city apart',
    start: 'START SURVIVAL',
    options: 'OPTIONS',
    close: 'CLOSE',
    graphics: 'GRAPHICS',
    qualityHigh: 'HIGH',
    qualityLow: 'LOW',
    language: 'LANGUAGE',
    weaponPicker: 'starting weapon selection',
    controlFly: 'FLY WHERE YOU LOOK',
    controlStrafe: 'RIGHT / LEFT',
    controlAim: 'STEER / AIM',
    controlBeam: 'HOLD BEAM · ABSORB',
    controlLaser: 'LASER',
    controlDump: 'DUMP BEAM LOAD',
    controlBoost: 'TURBO BOOST',
    mass: 'MASS',
    massHint: 'ABSORB PEOPLE AND CATS TO GROW',
    collapseAt: 'COLLAPSE',
    clock: 'CLOCK',
    score: 'SCORE',
    wave: 'WAVE',
    run: 'RUN',
    beam: 'BEAM',
    beamSearching: 'SEARCHING',
    beamReady: 'READY',
    beamLocked: 'LOCKED',
    beamPulling: 'PULLING',
    beamAmplified: 'AMPLIFIED',
    drag: 'DRAG',
    dumpHint: 'R TO DUMP',
    slowdown: 'SLOWDOWN',
    turbo: 'TURBO',
    turboActive: 'ACTIVE',
    auto: 'AUTO',
    live: 'LIVE',
    speed: 'SPEED',
    altitude: 'ALT',
    threats: 'THREATS',
    pilotCam: 'PILOT CAM',
    radar: 'LOCAL GRID · LIVE',
    survivedTitle: 'SURVIVED THE RAID',
    collapsedTitle: 'CORE COLLAPSED',
    survivedLead: 'You outlasted the clock',
    collapsedLead: 'Mass fell below the limit',
    finalScore: 'FINAL SCORE',
    statSurvived: 'SURVIVED',
    statMass: 'FINAL MASS',
    statAbsorbed: 'ABSORBED',
    statWave: 'WAVE',
    retry: 'RAID AGAIN',
    bandGround: 'GROUND BAND',
    bandArmor: 'ARMOR BAND',
    bandAa: 'AA BAND',
    bandGroundNote: 'GROUND UNITS LIVE',
    bandArmorNote: 'TANKS LIVE',
    bandAaNote: 'MISSILES LIVE',
    msgRunStart: 'ABSORB PEOPLE TO GROW',
    msgAbsorbedPerson: (reward) => `PERSON ABSORBED · +${reward}`,
    msgAbsorbedCat: (reward) => `CAT ABSORBED · +${reward}`,
    msgAbsorbedObject: (reward) => `LARGE OBJECT ABSORBED · +${reward}`,
    msgEnemyDown: (reward) => `ENEMY DOWN · +${reward}`,
    msgImpact: 'IMPACT · SIZE DOWN',
    msgDetonated: 'EXPLOSIVE DETONATED · SIZE DOWN',
    msgCarLaunched: 'CAR LAUNCHED · +50',
    msgDumped: (count) => `LOAD DUMPED · ${count}`,
    msgTurbo: 'TURBO ENGAGED',
  },
}

export function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE
  try {
    const stored = window.localStorage.getItem('ufo-attack-language')
    return LANGUAGES.includes(stored as Language) ? (stored as Language) : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function storeLanguage(language: Language) {
  try {
    window.localStorage.setItem('ufo-attack-language', language)
  } catch {
    // Losing the preference is not worth failing the switch.
  }
}

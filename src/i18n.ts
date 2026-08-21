import type { UpgradeId } from './core/upgrades'
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
 * Wave bulletins work the same way: the runtime stores which wave went on air
 * and nothing else, and the words are picked here - once for the HUD band and
 * once, per frame, for the anchor's caption bar on the city's news towers.
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
  hull: string
  repairing: string
  ceiling: string
  overloaded: string
  overloadAlarm: string
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
  breakingFlag: string
  broadcast: BulletinSet
  upgradeTitle: string
  upgradeLead: string
  upgradeHint: string
  upgradeLevel: string
  upgradeMaxed: string
  upgrades: Record<UpgradeId, UpgradeCopy>
}

/** One upgrade card's wording. The card itself is data in core/upgrades. */
export type UpgradeCopy = { name: string; detail: string }

/**
 * One wave bulletin: a short headline for the caption bar on the city's news
 * screens, and the sentence the anchor reads, which is what the player
 * actually gets to read on the HUD card.
 *
 * The line carries its own newline. Where a broadcast caption breaks is a
 * writing decision, not a layout one - Korean, Japanese and English put their
 * clauses in different places, so leaving it to the browser would break one
 * language mid-phrase to suit another's width. Every line here is split by
 * hand at a clause boundary, and the card renders it with `pre-line`.
 */
export type Bulletin = {
  headline: string
  line: string
}

/** Exactly one bulletin per wave stage. A tuple rather than an array so a
 *  language that forgets a stage fails to compile. */
type BulletinSet = readonly [Bulletin, Bulletin, Bulletin, Bulletin, Bulletin, Bulletin, Bulletin, Bulletin]

/** Keys the simulation may raise as a mid-run callout. */
export type MessageKey = {
  [K in keyof Strings]: K extends `msg${string}` ? K : never
}[keyof Strings]

export function bulletinFor(strings: Strings, stage: number): Bulletin {
  return strings.broadcast[Math.min(strings.broadcast.length - 1, Math.max(0, stage))]!
}

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
    hull: '선체',
    repairing: '수리 중',
    ceiling: '상승 한계',
    overloaded: '과적',
    overloadAlarm: '과적 — 고도 유지 불가 · R로 투기',
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
    breakingFlag: '속보',
    broadcast: [
      { headline: '미확인 비행물체 도심 출현', line: '속보입니다. 미확인 비행물체가 도심 상공에 출현했습니다.\n정부는 요격을 위해 자폭 드론을 배치했습니다.' },
      { headline: '경찰 총력 대응', line: '속보입니다. 경찰이 전 병력에 비상을 걸고\n도심으로 향하고 있습니다.' },
      { headline: '경찰 헬기 투입', line: '속보입니다. 경찰 헬기가 상공에 투입됐습니다.\n시민 여러분은 실내로 대피하십시오.' },
      { headline: '군 병력 도심 전개', line: '속보입니다. 군 병력이\n도심 전역에 전개됐습니다.' },
      { headline: '전투기 긴급 발진', line: '속보입니다. 공군이 UFO 격추를 위해\n전투기를 긴급 발진시켰습니다.' },
      { headline: '대공 방어망 가동', line: '속보입니다. 도심 전역에 대공 방어망이 가동됐습니다.\n저공 비행체를 요격합니다.' },
      { headline: '기갑 부대 진입', line: '속보입니다. 기갑 부대가\n시내로 진입했습니다.' },
      { headline: '최종 요격 작전', line: '속보입니다. 정부가 최종 요격 작전을 승인했습니다.\n모든 전력이 UFO를 향합니다.' },
    ],
    upgradeTitle: '강화 선택',
    upgradeLead: '흡수한 만큼 기체가 진화합니다. 하나를 고르세요.',
    upgradeHint: '클릭 또는 1 / 2 / 3',
    upgradeLevel: 'Lv',
    upgradeMaxed: '최대',
    upgrades: {
      'beam-reach': { name: '빔 사거리', detail: '빔이 아래로 더 멀리 닿습니다. 높은 곳에서도 지면을 훑을 수 있습니다.' },
      'beam-radius': { name: '빔 범위', detail: '빔 원뿔이 넓어집니다. 한 번에 더 많이 걸리지만 잘못된 물체도 더 잘 걸립니다.' },
      'beam-grip': { name: '흡수력', detail: '걸린 물체를 더 세게 끌어올립니다. 무거운 것도 빨리 올라옵니다.' },
      'laser-power': { name: '레이저 위력', detail: 'Q 레이저의 피해량이 늘어납니다.' },
      thrust: { name: '추진력', detail: '최고 속도와 가속이 올라갑니다.' },
      turbo: { name: '터보', detail: '터보가 더 오래 가고 더 빨리 회복됩니다.' },
      hull: { name: '장갑', detail: '피격 시 받는 피해가 줄어듭니다.' },
      regen: { name: '재생', detail: '체력을 즉시 회복하고, 이후 회복 속도가 영구히 빨라집니다.' },
    },
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
    hull: '船体',
    repairing: '修理中',
    ceiling: '上昇限界',
    overloaded: '過積載',
    overloadAlarm: '過積載 — 高度を保てません · Rで投棄',
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
    breakingFlag: '速報',
    broadcast: [
      { headline: '未確認飛行物体が都心に出現', line: '速報です。未確認飛行物体が都心の上空に出現しました。\n政府は迎撃のため自爆ドローンを配備しました。' },
      { headline: '警察が総力対応', line: '速報です。警察が全部隊に非常態勢を敷き、\n都心へ向かっています。' },
      { headline: '警察ヘリを投入', line: '速報です。警察ヘリが上空に投入されました。\n市民の皆さまは屋内に避難してください。' },
      { headline: '軍部隊が都心に展開', line: '速報です。軍の部隊が\n都心全域に展開しました。' },
      { headline: '戦闘機が緊急発進', line: '速報です。空軍がUFO撃墜のため、\n戦闘機を緊急発進させました。' },
      { headline: '対空防衛網が稼働', line: '速報です。都心全域で対空防衛網が稼働しました。\n低空の飛行体を迎撃します。' },
      { headline: '機甲部隊が市内に進入', line: '速報です。機甲部隊が\n市内に進入しました。' },
      { headline: '最終迎撃作戦', line: '速報です。政府が最終迎撃作戦を承認しました。\n全戦力がUFOへ向かいます。' },
    ],
    upgradeTitle: '強化選択',
    upgradeLead: '吸収した分だけ機体が進化します。ひとつ選んでください。',
    upgradeHint: 'クリック または 1 / 2 / 3',
    upgradeLevel: 'Lv',
    upgradeMaxed: '最大',
    upgrades: {
      'beam-reach': { name: 'ビーム射程', detail: 'ビームが下へより遠くまで届きます。高い位置からでも地上を掃えます。' },
      'beam-radius': { name: 'ビーム範囲', detail: 'ビームの円錐が広がります。一度に多く掴めますが、余計な物も掴みます。' },
      'beam-grip': { name: '吸引力', detail: '掴んだ物をより強く引き上げます。重い物も早く上がります。' },
      'laser-power': { name: 'レーザー威力', detail: 'Qレーザーの与ダメージが増えます。' },
      thrust: { name: '推進力', detail: '最高速度と加速が上がります。' },
      turbo: { name: 'ターボ', detail: 'ターボが長持ちし、回復も早くなります。' },
      hull: { name: '装甲', detail: '被弾時に受けるダメージが減ります。' },
      regen: { name: '再生', detail: '体力を即座に回復し、以後の回復速度が永続的に上がります。' },
    },
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
    hull: 'HULL',
    repairing: 'REPAIRING',
    ceiling: 'CEILING',
    overloaded: 'OVERLOADED',
    overloadAlarm: 'OVERLOADED — LOSING ALTITUDE · R TO DUMP',
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
    breakingFlag: 'BREAKING',
    broadcast: [
      { headline: 'UFO SIGHTED OVER THE CITY', line: 'Breaking news. An unidentified craft has appeared over the city.\nThe government has deployed suicide drones to intercept it.' },
      { headline: 'POLICE ON FULL ALERT', line: 'Breaking news. Police have called up every available unit\nand are moving into the city centre.' },
      { headline: 'POLICE HELICOPTERS UP', line: 'Breaking news. Police helicopters are now airborne.\nResidents are urged to stay indoors.' },
      { headline: 'ARMY DEPLOYS DOWNTOWN', line: 'Breaking news. Army units have deployed\nacross the downtown districts.' },
      { headline: 'FIGHTERS SCRAMBLED', line: 'Breaking news. The air force has scrambled fighters\nto shoot the UFO down.' },
      { headline: 'AIR DEFENCE ONLINE', line: 'Breaking news. The city-wide air defence network is online\nand engaging low-flying craft.' },
      { headline: 'ARMOUR ROLLS IN', line: 'Breaking news. Armoured units\nhave entered the city.' },
      { headline: 'FINAL INTERCEPT ORDERED', line: 'Breaking news. The government has authorised a final intercept.\nEvery asset is now converging on the UFO.' },
    ],
    upgradeTitle: 'UPGRADE',
    upgradeLead: 'What you absorbed has changed the craft. Take one.',
    upgradeHint: 'click or 1 / 2 / 3',
    upgradeLevel: 'Lv',
    upgradeMaxed: 'MAX',
    upgrades: {
      'beam-reach': { name: 'BEAM RANGE', detail: 'The beam reaches further down. You can sweep the street from higher up.' },
      'beam-radius': { name: 'BEAM WIDTH', detail: 'A wider cone. It catches more at once, and catches more of the wrong things too.' },
      'beam-grip': { name: 'PULL STRENGTH', detail: 'Hauls what it has hold of harder. Even heavy loads come up quickly.' },
      'laser-power': { name: 'LASER POWER', detail: 'The Q laser hits harder.' },
      thrust: { name: 'THRUST', detail: 'Higher top speed and sharper acceleration.' },
      turbo: { name: 'TURBO', detail: 'Turbo lasts longer and refills faster.' },
      hull: { name: 'HULL', detail: 'You take less damage when you are hit.' },
      regen: { name: 'REGENERATION', detail: 'Patches you up now, and permanently speeds up how fast you recover after.' },
    },
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

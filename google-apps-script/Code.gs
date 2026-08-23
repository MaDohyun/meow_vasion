/**
 * 침략할거냥 랭킹 백엔드 (Google Apps Script)
 *
 * 이 파일은 저장소에서는 실행되지 않습니다. 랭킹을 담을 구글 스프레드시트에
 * 붙여넣어 웹 앱으로 배포하면, 게임이 그 URL로 기록을 보내고 읽어옵니다.
 * 설치 방법은 README의 "랭킹 · 구글 스프레드시트 연동"을 보세요.
 *
 * 설계 메모
 * - 시트가 곧 데이터베이스입니다. 한 행이 한 기록이고, 첫 행은 헤더입니다.
 *   사람이 시트를 직접 열어 정렬하거나 지워도 게임이 깨지지 않아야 하므로,
 *   읽을 때마다 값을 다시 검증하고 다시 정렬합니다.
 * - 클라이언트(src/core/leaderboard.ts)와 같은 규칙으로 이름을 다듬고 같은
 *   기준으로 정렬합니다. 한쪽만 고치면 두 화면이 서로 다른 순위를 보여주므로
 *   규칙을 바꿀 때는 반드시 양쪽을 같이 고쳐야 합니다.
 * - Apps Script 웹 앱은 OPTIONS(프리플라이트)에 응답하지 않습니다. 그래서
 *   게임은 JSON을 text/plain으로 보내고, 여기서는 e.postData.contents를 직접
 *   파싱합니다.
 */

/** 기록이 쌓이는 시트 이름. 없으면 처음 요청 때 헤더와 함께 만들어집니다. */
var SHEET_NAME = 'ranking'
/** 한 번에 돌려주는 최대 행 수. 게임 화면이 보여주는 양과 같습니다. */
var DEFAULT_LIMIT = 20
var MAX_LIMIT = 100
/** 이름 길이 상한. src/core/leaderboard.ts의 NAME_MAX_LENGTH와 같아야 합니다. */
var NAME_MAX_LENGTH = 12
/** 시트에 쌓인 행이 이보다 많아지면 뒤쪽은 읽지 않습니다. */
var MAX_SCAN_ROWS = 5000

var HEADERS = ['recordedAt', 'name', 'score', 'survivalTime', 'waveStage', 'victory', 'savedAtIso']

/** 랭킹을 읽습니다. GET /exec?limit=20 */
function doGet(e) {
  try {
    var limit = clampLimit(e && e.parameter ? e.parameter.limit : null)
    return json({ ok: true, entries: readEntries(limit) })
  } catch (error) {
    return json({ ok: false, error: String(error) })
  }
}

/** 기록을 남깁니다. 본문은 JSON 한 덩어리입니다. */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return json({ ok: false, error: 'empty body' })
    var body = JSON.parse(e.postData.contents)
    var name = sanitizeName(body.name)
    if (!name) return json({ ok: false, error: 'name required' })

    var entry = {
      recordedAt: toInteger(body.recordedAt, Date.now()),
      name: name,
      score: Math.max(0, toInteger(body.score, 0)),
      survivalTime: Math.max(0, toNumber(body.survivalTime, 0)),
      waveStage: Math.max(0, toInteger(body.waveStage, 0)),
      victory: body.victory === true || body.victory === 'true',
    }

    // 잠금은 "찾아보고 없으면 쓴다"를 한 덩어리로 묶기 위한 것입니다. 게임은
    // 응답이 늦으면 다시 보낼 수 있고, 그때 두 요청이 겹치면 검사를 둘 다
    // 통과해 행이 두 개 생깁니다. 그러면 플레이어 한 명이 순위표를 두 줄
    // 차지합니다. recordedAt은 게임이 만든 밀리초 단위 시각이라 같은 기록의
    // 재전송인지 새 기록인지 구별하는 열쇠가 됩니다.
    var lock = LockService.getScriptLock()
    lock.waitLock(20000)
    try {
      var sheet = getSheet()
      if (!hasEntry(sheet, entry)) {
        sheet.appendRow([
          entry.recordedAt,
          entry.name,
          entry.score,
          entry.survivalTime,
          entry.waveStage,
          entry.victory,
          new Date().toISOString(),
        ])
        SpreadsheetApp.flush()
      }
    } finally {
      lock.releaseLock()
    }

    var limit = clampLimit(body.limit)
    var entries = readEntries(limit)
    return json({ ok: true, entries: entries, rank: rankOf(entries, entry) })
  } catch (error) {
    return json({ ok: false, error: String(error) })
  }
}

function getSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = book.getSheetByName(SHEET_NAME)
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME)
    sheet.appendRow(HEADERS)
    sheet.setFrozenRows(1)
  }
  return sheet
}

/**
 * 이 기록이 이미 시트에 있는지 봅니다.
 *
 * 재전송을 걸러내는 용도이므로 최근 행부터 거슬러 올라가며 조금만 봅니다.
 * 재전송은 원본이 들어간 직후에 오지, 몇 백 판 뒤에 오지 않습니다.
 */
function hasEntry(sheet, entry) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return false
  var span = Math.min(lastRow - 1, 200)
  var values = sheet.getRange(lastRow - span + 1, 1, span, 2).getValues()
  for (var i = 0; i < values.length; i++) {
    if (toInteger(values[i][0], 0) === entry.recordedAt && sanitizeName(values[i][1]) === entry.name) return true
  }
  return false
}

/**
 * 시트를 읽어 정렬된 랭킹으로 만듭니다.
 *
 * 값이 이상한 행은 고치지 않고 버립니다. 손으로 편집한 시트에서 점수 칸에
 * 글자가 들어가면 0점짜리 유령 기록이 순위표에 남는데, 그건 게임의 버그처럼
 * 보이기 때문입니다.
 */
function readEntries(limit) {
  var sheet = getSheet()
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return []
  var rows = Math.min(lastRow - 1, MAX_SCAN_ROWS)
  var values = sheet.getRange(2, 1, rows, HEADERS.length).getValues()

  var entries = []
  for (var i = 0; i < values.length; i++) {
    var row = values[i]
    var name = sanitizeName(row[1])
    if (!name) continue
    var score = Number(row[2])
    if (!isFinite(score)) continue
    entries.push({
      recordedAt: toInteger(row[0], 0),
      name: name,
      score: Math.max(0, Math.floor(score)),
      survivalTime: Math.max(0, toNumber(row[3], 0)),
      waveStage: Math.max(0, toInteger(row[4], 0)),
      victory: row[5] === true || row[5] === 'true' || row[5] === 'TRUE',
    })
  }

  entries.sort(compareEntries)
  return entries.slice(0, limit)
}

/** 점수 → 생존 시간 → 먼저 기록한 쪽. 클라이언트와 같은 순서입니다. */
function compareEntries(a, b) {
  if (b.score !== a.score) return b.score - a.score
  if (b.survivalTime !== a.survivalTime) return b.survivalTime - a.survivalTime
  return a.recordedAt - b.recordedAt
}

function rankOf(entries, entry) {
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].recordedAt === entry.recordedAt && entries[i].name === entry.name) return i + 1
  }
  return null
}

/**
 * 이름 다듬기. src/core/leaderboard.ts의 sanitizeName과 같은 규칙입니다.
 *
 * Apps Script(Rhino 계열)에는 코드 포인트 단위 잘라내기가 없어 서로게이트
 * 쌍을 직접 살핍니다. 이모지 한 글자가 반쪽만 남아 깨진 문자로 저장되는 것을
 * 막기 위한 처리입니다.
 */
function sanitizeName(raw) {
  if (raw === null || raw === undefined) return ''
  var text = String(raw)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')

  var out = ''
  var counted = 0
  for (var i = 0; i < text.length && counted < NAME_MAX_LENGTH; i++) {
    var code = text.charCodeAt(i)
    var pair = code >= 0xd800 && code <= 0xdbff && i + 1 < text.length
    out += pair ? text.substr(i, 2) : text.charAt(i)
    if (pair) i++
    counted++
  }
  return out
}

function clampLimit(value) {
  var limit = Math.floor(Number(value))
  if (!isFinite(limit) || limit <= 0) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

function toNumber(value, fallback) {
  var number = Number(value)
  return isFinite(number) ? number : fallback
}

function toInteger(value, fallback) {
  return Math.floor(toNumber(value, fallback))
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON)
}

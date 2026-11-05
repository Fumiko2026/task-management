// 期限の入力(日付と時刻の入力欄・クイック選択)の計算。画面にも通信にも頼らない、ただの関数。
// 日時は、いつも日本時間(Asia/Tokyo)で扱う(要件 NM-10)。パソコンの時刻設定には、左右されない。

/** クイック選択の既定の時刻(設定画面ができるまで、18:00 固定)。 */
export const DEFAULT_DUE_TIME = '18:00'

/** クイック選択の種類。「来週」は、7日後。 */
export type QuickDue = 'today' | 'tomorrow' | 'nextWeek'

const QUICK_DAYS: Record<QuickDue, number> = { today: 0, tomorrow: 1, nextWeek: 7 }

/** 日本時間で、年・月・日・時・分に分ける。 */
const jstParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function partsOf(date: Date): Record<string, string> {
  return Object.fromEntries(jstParts.formatToParts(date).map((p) => [p.type, p.value]))
}

/** 入力欄(`datetime-local`)の値の形: 2026-11-10T18:00 */
const INPUT_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/

/** サーバーから届いた日時(ISO 8601)を、日本時間の「入力欄の値」(2026-11-10T18:00)にする。 */
export function toInputValue(iso: string): string {
  const p = partsOf(new Date(iso))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

/**
 * 入力欄の値(日本時間)を、サーバーに送る形(時差 +09:00 つきの ISO 8601)にする。
 * 形が正しくなければ null。
 */
export function fromInputValue(value: string): string | null {
  const m = INPUT_VALUE.exec(value)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`
}

/** クイック選択の日付(日本時間の今日から、何日後か)に、18:00 を付けた、入力欄の値。 */
export function quickDue(kind: QuickDue, now: Date): string {
  const p = partsOf(now)
  // 日本時間の「今日」の日付を、UTC の日付として扱って、日数を足す(月またぎ・年またぎも、これで正しく進む)
  const day = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + QUICK_DAYS[kind]))
  const yyyy = String(day.getUTCFullYear()).padStart(4, '0')
  const mm = String(day.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(day.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${DEFAULT_DUE_TIME}`
}

/** 入力欄の値が、いま(now)より前の日時か。形が正しくなければ false。 */
export function isPast(value: string, now: Date): boolean {
  const iso = fromInputValue(value)
  return iso !== null && new Date(iso).getTime() < now.getTime()
}

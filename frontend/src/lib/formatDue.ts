import type { CardView } from '../api/types'

// 日付は、パソコンの設定に関わらず、日本時間(Asia/Tokyo)で表示する(要件 NM-10)。
const formatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
})

/** 期限の日時を、「10/25」の短い形にする(画面仕様 §3-④)。 */
export function formatDueDate(iso: string): string {
  const parts = formatter.formatToParts(new Date(iso))
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${month}/${day}`
}

// 「11/10(月) 18:00」の形(日本時間)
const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** 期限の日時を、「11/10(月) 18:00」の形にする(編集ダイアログで、いまの期限を見せるとき)。 */
export function formatDueDateTime(iso: string): string {
  const parts = Object.fromEntries(dateTimeFormatter.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return `${parts.month}/${parts.day}(${parts.weekday}) ${parts.hour}:${parts.minute}`
}

/**
 * カードに出す期限の表示(画面仕様 §4)。色だけに頼らず、アイコンと文字を一緒に出す。
 * 出さないとき(期限なし)は null。
 *   通常     : 🕒 10/25
 *   もうすぐ : ⏰ 10/25 もうすぐ
 *   超過     : ❗ 10/25 超過
 *   完了     : ✔ 完了
 */
export function dueDisplay(card: CardView): { icon: string; text: string } | null {
  switch (card.dueStatus) {
    case 'NONE':
      return null
    case 'COMPLETED':
      return { icon: card.dueIcon, text: card.dueLabel }
    case 'NORMAL':
      return { icon: card.dueIcon, text: card.dueAt ? formatDueDate(card.dueAt) : '' }
    case 'DUE_SOON':
    case 'OVERDUE':
      return {
        icon: card.dueIcon,
        text: card.dueAt ? `${formatDueDate(card.dueAt)} ${card.dueLabel}` : card.dueLabel,
      }
  }
}

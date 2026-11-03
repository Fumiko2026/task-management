// バックエンドの API が返すデータの形。
// backend の BoardView.java と同じ形にしてある。バックエンドを変えたら、ここも直す。

/** 期限の状態(バックエンドの DueStatus)。 */
export type DueStatus = 'NONE' | 'NORMAL' | 'DUE_SOON' | 'OVERDUE' | 'COMPLETED'

/** 担当者。self が true なら本人、false なら依頼先。 */
export interface Assignee {
  id: number
  name: string
  self: boolean
}

/** チェックリストの項目(準備の手順の1つ)。 */
export interface ChecklistItem {
  id: number
  text: string
  done: boolean
}

/** カード(1つのタスク)。assignee / dueAt / completedAt は、未設定のとき null。 */
export interface CardView {
  id: number
  title: string
  description: string
  assignee: Assignee | null
  assigneeMissing: boolean
  /** 期限。日時(ISO 8601。例: 2026-11-03T11:37:37+09:00) */
  dueAt: string | null
  dueStatus: DueStatus
  /** 期限の状態を示す絵文字(期限なしは空文字) */
  dueIcon: string
  /** 期限の状態を示す文字(期限なしは空文字) */
  dueLabel: string
  completedAt: string | null
  checklistDone: number
  checklistTotal: number
  checklist: ChecklistItem[]
}

/** リスト(ボードの中の列。例: 未着手)。 */
export interface ListView {
  id: number
  name: string
  position: number
  /** 真のリストへ移したカードは、完了として扱う */
  doneList: boolean
  cardCount: number
  cards: CardView[]
}

/** ボード全体。GET /api/board の応答。 */
export interface BoardView {
  id: number
  name: string
  lists: ListView[]
}

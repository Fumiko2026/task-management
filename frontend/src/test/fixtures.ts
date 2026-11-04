import type { BoardView, CardView, ListView } from '../api/types'

/** テスト用のカード。必要な項目だけ上書きして使う。 */
export function makeCard(overrides: Partial<CardView> = {}): CardView {
  return {
    id: 1,
    title: '見積書を作る',
    description: '',
    assignee: { id: 1, name: '自分', self: true },
    assigneeMissing: false,
    dueAt: null,
    dueStatus: 'NONE',
    dueIcon: '',
    dueLabel: '',
    completedAt: null,
    checklistDone: 0,
    checklistTotal: 0,
    checklist: [],
    ...overrides,
  }
}

export function makeList(overrides: Partial<ListView> = {}): ListView {
  const cards = overrides.cards ?? []
  return {
    id: 1,
    name: '未着手',
    position: 1,
    doneList: false,
    cardCount: cards.length,
    cards,
    ...overrides,
  }
}

/** API の「GET /api/board」と同じ形の、サンプルのボード(seed.sql のデータに近い内容)。 */
export function makeBoard(): BoardView {
  return {
    id: 1,
    name: 'はじめてのボード',
    lists: [
      makeList({
        id: 1,
        name: '未着手',
        position: 1,
        cards: [
          makeCard({
            id: 1,
            title: '見積書を作る',
            dueAt: '2026-11-02T06:37:37+09:00',
            dueStatus: 'OVERDUE',
            dueIcon: '❗',
            dueLabel: '超過',
            checklistDone: 3,
            checklistTotal: 5,
          }),
          makeCard({ id: 2, title: '資料をまとめる', assignee: null, assigneeMissing: true }),
        ],
      }),
      makeList({
        id: 2,
        name: '進行中',
        position: 2,
        cards: [
          makeCard({
            id: 3,
            title: '部長に報告',
            dueAt: '2026-11-03T11:37:37+09:00',
            dueStatus: 'DUE_SOON',
            dueIcon: '⏰',
            dueLabel: 'もうすぐ',
          }),
        ],
      }),
      makeList({
        id: 3,
        name: '完了',
        position: 3,
        doneList: true,
        cards: [
          makeCard({
            id: 5,
            title: '契約書の確認',
            assignee: { id: 2, name: '田中さん', self: false },
            dueAt: '2026-11-02T06:37:37+09:00',
            dueStatus: 'COMPLETED',
            dueIcon: '✔',
            dueLabel: '完了',
            completedAt: '2026-11-02T04:37:37+09:00',
          }),
        ],
      }),
    ],
  }
}

/** API の応答(JSON)を作る。fetch の差し替えに使う。 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  })
}

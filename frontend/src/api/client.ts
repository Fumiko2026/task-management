import type {
  BoardView,
  CardView,
  ChecklistItemRequest,
  CompleteCardRequest,
  CreateCardRequest,
  MoveCardRequest,
  UpdateCardRequest,
} from './types'

/** API の呼び出しに失敗したとき。status は HTTP の番号(通信そのものが失敗したときは 0)。 */
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** GET /api/board : ボード全体(リストと、その中のカード)を取得する。 */
export async function fetchBoard(): Promise<BoardView> {
  let response: Response
  try {
    response = await fetch('/api/board', { headers: { Accept: 'application/json' } })
  } catch {
    // サーバーが止まっている、ネットワークがつながらない、など
    throw new ApiError(0, '通信できませんでした')
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readMessage(response))
  }
  return (await response.json()) as BoardView
}

/**
 * POST /api/cards : カードを新しく作る。作れたら、作ったカードを返す。
 * 失敗(入力が正しくない 400、リストが無い 404 など)は、API の理由を持つ ApiError にする。
 */
export async function createCard(listId: number, title: string): Promise<CardView> {
  const request: CreateCardRequest = { listId, title }
  let response: Response
  try {
    response = await fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    })
  } catch {
    throw new ApiError(0, '通信できませんでした')
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readMessage(response))
  }
  return (await response.json()) as CardView
}

/**
 * PATCH /api/cards/{id}/move : カードを動かす。position は、移し先で何番目か(1 から)。
 * 動かせたら、動かしたあとのカード(完了日時や期限の状態が新しい)を返す。
 * 失敗(リストが無い 404、位置が正しくない 400 など)は、API の理由を持つ ApiError にする。
 */
export async function moveCard(cardId: number, listId: number, position: number): Promise<CardView> {
  const request: MoveCardRequest = { listId, position }
  let response: Response
  try {
    response = await fetch(`/api/cards/${cardId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    })
  } catch {
    throw new ApiError(0, '通信できませんでした')
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readMessage(response))
  }
  return (await response.json()) as CardView
}

/**
 * PATCH /api/cards/{id} : カードを更新する(いまは、期限だけ)。dueAt は、時差つきの日時(例: 2026-11-10T18:00:00+09:00)。
 * null を送ると、期限が消える。更新できたら、更新後のカード(期限の状態も新しい値)を返す。
 * 失敗(日時の形が正しくない 400、カードが無い 404 など)は、API の理由を持つ ApiError にする。
 */
export async function updateCard(cardId: number, changes: UpdateCardRequest): Promise<CardView> {
  let response: Response
  try {
    response = await fetch(`/api/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(changes),
    })
  } catch {
    throw new ApiError(0, '通信できませんでした')
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readMessage(response))
  }
  return (await response.json()) as CardView
}

/**
 * DELETE /api/cards/{id} : カードを削除する(DB から本当に消える。元に戻せない)。
 * 消せたら、何も返さない(204)。カードが無い 404 などは、API の理由を持つ ApiError にする。
 */
export async function deleteCard(cardId: number): Promise<void> {
  let response: Response
  try {
    response = await fetch(`/api/cards/${cardId}`, { method: 'DELETE', headers: { Accept: 'application/json' } })
  } catch {
    throw new ApiError(0, '通信できませんでした')
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readMessage(response))
  }
}

/**
 * PATCH /api/cards/{id}/complete : カードを完了にする(completed = true)、または未完了に戻す(false)。
 * 完了にすると「完了」リストのいちばん上へ。未完了に戻すと、完了前にいたリストの最後へ(position で位置も指定できる)。
 * 更新後のカードを返す。失敗(カードが無い 404 など)は、API の理由を持つ ApiError にする。
 */
export async function completeCard(cardId: number, completed: boolean, position?: number): Promise<CardView> {
  const request: CompleteCardRequest = position === undefined ? { completed } : { completed, position }
  let response: Response
  try {
    response = await fetch(`/api/cards/${cardId}/complete`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    })
  } catch {
    throw new ApiError(0, '通信できませんでした')
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readMessage(response))
  }
  return (await response.json()) as CardView
}

/**
 * PATCH /api/checklist-items/{id} : チェックリストの項目を、完了にする(done = true)、または未完了に戻す(false)。
 * その項目があるカード(更新後)を返す。失敗(項目が無い 404 など)は、API の理由を持つ ApiError にする。
 */
export async function setChecklistItemDone(itemId: number, done: boolean): Promise<CardView> {
  const request: ChecklistItemRequest = { done }
  let response: Response
  try {
    response = await fetch(`/api/checklist-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    })
  } catch {
    throw new ApiError(0, '通信できませんでした')
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readMessage(response))
  }
  return (await response.json()) as CardView
}

/** エラー応答の {"message": "..."} から理由を取り出す。読めなければ、番号だけの文にする。 */
async function readMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') {
      return body.message
    }
  } catch {
    // JSON ではなかった。下の文を使う。
  }
  return `エラーが起きました(${response.status})`
}

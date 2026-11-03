import type { BoardView, CardView, CreateCardRequest } from './types'

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

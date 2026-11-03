import { useCallback, useEffect, useState } from 'react'
import { ApiError, fetchBoard } from '../api/client'
import type { BoardView, CardView } from '../api/types'

/** ボードの読み込みの状態。画面は、この状態に合わせて表示を切り替える。 */
export type BoardState =
  | { status: 'loading' }
  | { status: 'ready'; board: BoardView }
  /** ボードが1つも無い(API が 404 を返した) */
  | { status: 'empty'; message: string }
  /** 読み込めなかった */
  | { status: 'error'; message: string }

/** ボードを API から読み込む。reload() で、もう一度読み込む。addCard() で、作ったカードを画面に足す。 */
export function useBoard() {
  const [state, setState] = useState<BoardState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // 画面が消えた後や、読み直しを始めた後に、古い結果で画面を書き換えないための目印
    let cancelled = false

    fetchBoard()
      .then((board) => {
        if (!cancelled) setState({ status: 'ready', board })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: 'empty', message: error.message })
        } else {
          setState({ status: 'error', message: error instanceof Error ? error.message : '不明なエラー' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  /**
   * 作ったカードを、そのリストの最後に足す(ボード全体を読み込み直さない)。
   * 並び順は、API が「リストの最後」に作るので、画面でも最後に足せば同じになる。
   */
  const addCard = useCallback((listId: number, card: CardView) => {
    setState((current) => {
      if (current.status !== 'ready') return current
      const lists = current.board.lists.map((list) =>
        list.id === listId ? { ...list, cards: [...list.cards, card], cardCount: list.cardCount + 1 } : list,
      )
      return { status: 'ready', board: { ...current.board, lists } }
    })
  }, [])

  return { state, reload, addCard }
}

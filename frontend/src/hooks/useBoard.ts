import { useCallback, useEffect, useState } from 'react'
import {
  addChecklistItem as requestAddChecklistItem,
  ApiError,
  completeCard as requestCompleteCard,
  deleteCard as requestDeleteCard,
  fetchBoard,
  moveCard as requestMoveCard,
  setChecklistItemDone as requestSetChecklistItemDone,
  updateCard as requestUpdateCard,
} from '../api/client'
import type { BoardView, CardView, UpdateCardRequest } from '../api/types'
import { moveCardInBoard, removeCard, replaceCard } from '../lib/boardMove'
import type { CardPlace } from '../lib/boardMove'

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

  /**
   * カードを from から to へ動かす。
   *   1. すぐ画面に反映する(通信を待たない)。
   *   2. 保存の通信をして、成功したら、返ってきたカード(完了日時・期限の状態が新しい)で置き換える。
   *   3. 失敗したら、元の場所へ戻して、理由(日本語の文)を返す。成功なら null を返す。
   * 戻すときは、ボード全体を昔の状態に戻さず、このカードだけを元の場所に動かす
   * (通信中に、別のカードを追加していても、消さないため)。
   */
  const moveCard = useCallback(async (cardId: number, from: CardPlace, to: CardPlace): Promise<string | null> => {
    const apply = (change: (board: BoardView) => BoardView) =>
      setState((current) => (current.status === 'ready' ? { status: 'ready', board: change(current.board) } : current))

    apply((board) => moveCardInBoard(board, cardId, to.listId, to.index))
    try {
      const saved = await requestMoveCard(cardId, to.listId, to.index + 1)
      apply((board) => replaceCard(board, saved))
      return null
    } catch (error) {
      apply((board) => moveCardInBoard(board, cardId, from.listId, from.index))
      return error instanceof Error ? error.message : '不明なエラー'
    }
  }, [])

  /**
   * カードを更新する(いまは、期限だけ)。保存できたら、返ってきたカード(期限の状態が新しい)で置き換える。
   * 成功なら null、失敗なら理由(日本語の文)を返す。失敗のときは、ボードは変えない。
   */
  const updateCard = useCallback(async (cardId: number, changes: UpdateCardRequest): Promise<string | null> => {
    try {
      const saved = await requestUpdateCard(cardId, changes)
      setState((current) =>
        current.status === 'ready' ? { status: 'ready', board: replaceCard(current.board, saved) } : current,
      )
      return null
    } catch (error) {
      return error instanceof Error ? error.message : '不明なエラー'
    }
  }, [])

  /**
   * カードを削除する(DB から本当に消える)。元に戻せないので、先に画面から消さず、
   * 消せたことが分かってから、画面から取り除く。成功なら null、失敗なら理由を返す。
   * すでに無かったとき(404)は、もう消えているので、成功と同じに扱う(画面からも取り除く)。
   */
  const deleteCard = useCallback(async (cardId: number): Promise<string | null> => {
    const remove = () =>
      setState((current) =>
        current.status === 'ready' ? { status: 'ready', board: removeCard(current.board, cardId) } : current,
      )
    try {
      await requestDeleteCard(cardId)
      remove()
      return null
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        remove()
        return null
      }
      return error instanceof Error ? error.message : '不明なエラー'
    }
  }, [])

  /**
   * ボードを取り直す(読み込み中の灰色の枠は出さない)。完了・未完了のあと、置き場所(並び順・件数)を、
   * サーバーの結果にそろえるために使う。取り直せなかったときは、いまの画面を、そのまま残す。
   */
  const refresh = useCallback(async () => {
    try {
      const board = await fetchBoard()
      setState({ status: 'ready', board })
    } catch {
      // いまの画面を残す
    }
  }, [])

  /**
   * カードを完了にする(completed = true)、または未完了に戻す(false)。
   * 置き場所の計算は、サーバーに任せる(完了は「完了」リストのいちばん上、戻すときは完了前のリストの最後。
   * position で位置も指定できる)。保存できたら、ボードを取り直す。成功なら null、失敗なら理由を返し、ボードは変えない。
   */
  const setCardCompleted = useCallback(
    async (cardId: number, completed: boolean, position?: number): Promise<string | null> => {
      try {
        await requestCompleteCard(cardId, completed, position)
      } catch (error) {
        return error instanceof Error ? error.message : '不明なエラー'
      }
      await refresh()
      return null
    },
    [refresh],
  )

  /**
   * チェックリストの項目を、完了にする(done = true)、または未完了に戻す(false)。
   * 通信が成功してから、返ってきたカードで置き換える(カード一覧の「3/5」も、同時に変わる)。
   * 先には変えないので、失敗したときに戻す必要が無い。成功なら null、失敗なら理由(日本語の文)を返し、ボードは変えない。
   */
  const setChecklistItemDone = useCallback(async (itemId: number, done: boolean): Promise<string | null> => {
    try {
      const saved = await requestSetChecklistItemDone(itemId, done)
      setState((current) =>
        current.status === 'ready' ? { status: 'ready', board: replaceCard(current.board, saved) } : current,
      )
      return null
    } catch (error) {
      return error instanceof Error ? error.message : '不明なエラー'
    }
  }, [])

  /**
   * チェックリストに項目を足す(そのカードの最後に、未完了で入る)。
   * 通信が成功してから、返ってきたカードで置き換える(項目の一覧も、カード一覧の「0/1」なども、同時に変わる)。
   * 成功なら null、失敗なら理由(日本語の文)を返し、ボードは変えない。
   */
  const addChecklistItem = useCallback(async (cardId: number, text: string): Promise<string | null> => {
    try {
      const saved = await requestAddChecklistItem(cardId, text)
      setState((current) =>
        current.status === 'ready' ? { status: 'ready', board: replaceCard(current.board, saved) } : current,
      )
      return null
    } catch (error) {
      return error instanceof Error ? error.message : '不明なエラー'
    }
  }, [])

  return {
    state,
    reload,
    addCard,
    moveCard,
    updateCard,
    deleteCard,
    refresh,
    setCardCompleted,
    setChecklistItemDone,
    addChecklistItem,
  }
}

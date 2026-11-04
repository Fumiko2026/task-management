import { useEffect, useState } from 'react'
import { useBoard } from '../hooks/useBoard'
import type { CardPlace } from '../lib/boardMove'
import { BoardColumns } from './BoardColumns'
import { BoardHeader } from './BoardHeader'
import { BoardSkeleton } from './BoardSkeleton'
import { ErrorMessage } from './ErrorMessage'

/** 保存できなかった知らせを、出しておく時間(ミリ秒)。 */
const TOAST_MS = 6000

/**
 * ボード画面(画面仕様 S-03)。API から読み込んだボードを、リストとカードで見せる。
 * カードを追加でき、ドラッグで入れ替えられる(「完了」へ入れると完了になり、出すと未完了に戻る)。
 */
export function BoardPage() {
  const { state, reload, addCard, moveCard } = useBoard()
  const [moveError, setMoveError] = useState<string | null>(null)

  // 保存できなかった知らせは、しばらくしたら、自動で消す
  useEffect(() => {
    if (moveError === null) return
    const timer = setTimeout(() => setMoveError(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [moveError])

  async function onMoveCard(cardId: number, from: CardPlace, to: CardPlace) {
    setMoveError(null)
    const error = await moveCard(cardId, from, to) // 失敗したら、useBoard が、元の場所へ戻す
    if (error !== null) setMoveError(error)
  }

  switch (state.status) {
    case 'loading':
      return (
        <div className="page">
          <BoardHeader title="タスク管理" />
          <BoardSkeleton />
        </div>
      )

    case 'error':
      return (
        <div className="page">
          <BoardHeader title="タスク管理" />
          <ErrorMessage detail={state.message} onRetry={reload} />
        </div>
      )

    case 'empty':
      return (
        <div className="page">
          <BoardHeader title="タスク管理" />
          <div className="notice" role="status">
            <p className="notice-title">{state.message}</p>
          </div>
        </div>
      )

    case 'ready': {
      const { board } = state
      const noCards = board.lists.every((list) => list.cards.length === 0)
      return (
        <div className="page">
          <BoardHeader title={board.name} />
          {noCards && <p className="board-guide">最初のカードを追加しましょう</p>}
          <BoardColumns board={board} onCardAdded={addCard} onMoveCard={onMoveCard} />
          {moveError !== null && (
            <div className="toast" role="alert">
              <span>保存できませんでした。{moveError}。カードを元の場所に戻しました。</span>
              <button type="button" className="toast-close" onClick={() => setMoveError(null)}>
                閉じる
              </button>
            </div>
          )}
        </div>
      )
    }
  }
}

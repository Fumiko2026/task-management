import { useEffect, useState } from 'react'
import type { CardView } from '../api/types'
import { useBoard } from '../hooks/useBoard'
import { findCard } from '../lib/boardMove'
import type { CardPlace } from '../lib/boardMove'
import { BoardColumns } from './BoardColumns'
import { CardEditDialog } from './CardEditDialog'
import { BoardHeader } from './BoardHeader'
import { BoardSkeleton } from './BoardSkeleton'
import { ConfirmDialog } from './ConfirmDialog'
import { ErrorMessage } from './ErrorMessage'

/** 保存できなかった知らせ・削除などの知らせを、出しておく時間(ミリ秒)。 */
const TOAST_MS = 6000
/** 「完了にしました [元に戻す]」を、出しておく時間(画面仕様 §3-④-a。5 秒)。 */
const UNDO_MS = 5000

/** 画面の下に出す、緑の知らせ。actionLabel と onAction があれば、「元に戻す」のようなボタンも出す。 */
interface Notice {
  text: string
  actionLabel?: string
  onAction?: () => void
  /** 自動で消えるまでの時間(ミリ秒) */
  ms: number
}

/**
 * ボード画面(画面仕様 S-03)。API から読み込んだボードを、リストとカードで見せる。
 * カードを追加でき、ドラッグで入れ替えられ、押すと編集ダイアログが開く。
 * 完了マーク(○/✔)を押すと、完了にする・未完了に戻す(「完了」へ入れると完了になり、出すと未完了に戻る)。
 */
export function BoardPage() {
  const { state, reload, addCard, moveCard, updateCard, deleteCard, setCardCompleted, setChecklistItemDone, addChecklistItem } = useBoard()
  const [failure, setFailure] = useState<string | null>(null) // 保存できなかったときの知らせ(赤)
  const [editingCardId, setEditingCardId] = useState<number | null>(null) // 編集ダイアログで開いているカード
  const [confirmCard, setConfirmCard] = useState<CardView | null>(null) // 「チェックリストが残っています」の確認の対象
  const [notice, setNotice] = useState<Notice | null>(null) // 「削除しました」「完了にしました」などの知らせ(緑)

  // 保存できなかった知らせは、しばらくしたら、自動で消す
  useEffect(() => {
    if (failure === null) return
    const timer = setTimeout(() => setFailure(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [failure])

  // 知らせも、それぞれの時間がたったら、自動で消す
  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), notice.ms)
    return () => clearTimeout(timer)
  }, [notice])

  const board = state.status === 'ready' ? state.board : null

  async function onMoveCard(cardId: number, from: CardPlace, to: CardPlace) {
    setFailure(null)
    const error = await moveCard(cardId, from, to) // 失敗したら、useBoard が、元の場所へ戻す
    if (error !== null) setFailure(`保存できませんでした。${error}。カードを元の場所に戻しました。`)
  }

  /** 完了にする。押す前の場所(リストと位置)を覚えておいて、「元に戻す」で、そこへ戻す。 */
  async function completeCard(card: CardView) {
    const place = board ? findCard(board, card.id) : null
    setFailure(null)
    const error = await setCardCompleted(card.id, true) // 「完了」リストのいちばん上へ(サーバーが決める)
    if (error !== null) {
      setFailure(`保存できませんでした。${error}`)
      return
    }
    navigator.vibrate?.(15) // 軽く振動(スマホ。対応していない端末では、何も起きない)
    setNotice({
      text: `「${card.title}」を完了にしました`,
      actionLabel: '元に戻す',
      onAction: () => void undoComplete(card, place),
      ms: UNDO_MS,
    })
  }

  /** 「元に戻す」: 完了前にいたリストの、もとの位置へ戻す(位置は 1 から数える)。 */
  async function undoComplete(card: CardView, place: CardPlace | null) {
    setNotice(null)
    setFailure(null)
    const error = await setCardCompleted(card.id, false, place ? place.index + 1 : undefined)
    if (error !== null) setFailure(`保存できませんでした。${error}`)
  }

  /** ✔ を押したとき: 未完了に戻す(完了前にいたリストの最後へ)。 */
  async function reopenCard(card: CardView) {
    setFailure(null)
    const error = await setCardCompleted(card.id, false)
    if (error !== null) {
      setFailure(`保存できませんでした。${error}`)
      return
    }
    setNotice({ text: `「${card.title}」を未完了に戻しました`, ms: 4000 })
  }

  /** 完了マークを押したとき。完了済みなら戻す。未完了なら、チェック項目が残っていれば確認してから、完了にする。 */
  function onToggleComplete(card: CardView) {
    if (card.completedAt !== null) {
      void reopenCard(card)
    } else if (card.checklistTotal > card.checklistDone) {
      setConfirmCard(card)
    } else {
      void completeCard(card)
    }
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
      const editingCard = board.lists.flatMap((list) => list.cards).find((card) => card.id === editingCardId)
      return (
        <div className="page">
          <BoardHeader title={board.name} />
          {noCards && <p className="board-guide">最初のカードを追加しましょう</p>}
          <BoardColumns
            board={board}
            onCardAdded={addCard}
            onMoveCard={onMoveCard}
            onOpenCard={setEditingCardId}
            onToggleComplete={onToggleComplete}
          />
          {/* ダイアログには、ボードの最新のカードを渡す。カードが消えたら(削除したら)、ダイアログも消える */}
          {editingCard && (
            <CardEditDialog
              key={editingCard.id}
              card={editingCard}
              onClose={() => setEditingCardId(null)}
              onSaveDue={(dueAt) => updateCard(editingCard.id, { dueAt })}
              onToggleChecklistItem={setChecklistItemDone}
              onAddChecklistItem={(text) => addChecklistItem(editingCard.id, text)}
              onDelete={async () => {
                const error = await deleteCard(editingCard.id)
                if (error === null) setNotice({ text: `「${editingCard.title}」を削除しました`, ms: TOAST_MS })
                return error
              }}
            />
          )}
          {/* チェック項目が残っているカードを完了にするときの確認(UC-04) */}
          {confirmCard && (
            <ConfirmDialog
              title="チェックリストが残っています"
              confirmLabel="完了にする"
              onConfirm={() => {
                const target = confirmCard
                setConfirmCard(null)
                void completeCard(target)
              }}
              onCancel={() => setConfirmCard(null)}
            >
              <p>
                「{confirmCard.title}」には、まだ終わっていない手順が {confirmCard.checklistTotal - confirmCard.checklistDone}{' '}
                件あります。完了にしますか
              </p>
            </ConfirmDialog>
          )}
          {notice !== null && (
            <div className="toast toast--ok" role="status">
              <span>{notice.text}</span>
              {notice.actionLabel && notice.onAction && (
                <button type="button" className="toast-close toast-close--ok toast-action" onClick={notice.onAction}>
                  {notice.actionLabel}
                </button>
              )}
              <button type="button" className="toast-close toast-close--ok" onClick={() => setNotice(null)}>
                閉じる
              </button>
            </div>
          )}
          {failure !== null && (
            <div className="toast" role="alert">
              <span>{failure}</span>
              <button type="button" className="toast-close" onClick={() => setFailure(null)}>
                閉じる
              </button>
            </div>
          )}
        </div>
      )
    }
  }
}

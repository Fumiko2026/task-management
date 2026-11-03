import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { createCard } from '../api/client'
import type { CardView } from '../api/types'

/** カードのタイトルの長さの上限(要件 NM-06。バックエンドと同じ)。 */
const TITLE_MAX_LENGTH = 100

/**
 * 「＋ カードを追加」(画面仕様 §3-⑤)。
 * 押すと、その場に入力欄が開く。タイトルだけ入れて「追加」を押せば作れる(担当者は自分、期限なし)。
 * 追加したあとも入力欄は開いたままで、続けて追加できる。「キャンセル」か Esc で閉じる。
 */
export function AddCardForm({ listId, onAdded }: { listId: number; onAdded: (card: CardView) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // 追加できた回数。増えたら、フォームが見える位置まで、画面をずらす
  const [addedCount, setAddedCount] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // 送信中の目印。state は次の描画まで変わらないので、すばやい二度押しを、ここで防ぐ
  const sendingRef = useRef(false)

  const canSubmit = title.trim() !== '' && !saving

  // リストが縦に長いと、フォームが下に隠れる。開いたとき、カードが増えたとき、失敗の理由が出たときに、
  // 入力欄と「追加」「キャンセル」と理由が、すべて見える位置まで、画面をずらす。
  // (scrollIntoView は、古い環境やテストの環境には無いので、あるときだけ使う)
  useEffect(() => {
    if (open) formRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [open, error, addedCount])

  function close() {
    setOpen(false)
    setTitle('')
    setError(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (trimmed === '' || sendingRef.current) return

    sendingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const card = await createCard(listId, trimmed)
      onAdded(card)
      // 入力欄は開いたまま、空にして、続けて入力できるようにする
      setTitle('')
      setAnnouncement(`「${card.title}」を追加しました`)
      setAddedCount((n) => n + 1)
      inputRef.current?.focus()
    } catch (e) {
      // 入力した文字は残す。直して、もう一度押せる
      setError(e instanceof Error ? e.message : '不明なエラー')
    } finally {
      sendingRef.current = false
      setSaving(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') close()
  }

  if (!open) {
    return (
      <button type="button" className="add-card-button" onClick={() => setOpen(true)}>
        ＋ カードを追加
      </button>
    )
  }

  return (
    <form ref={formRef} className="add-card-form" aria-label="カードを追加" onSubmit={submit}>
      <input
        ref={inputRef}
        className="add-card-input"
        type="text"
        aria-label="カードのタイトル"
        placeholder="タイトルを入力"
        maxLength={TITLE_MAX_LENGTH}
        autoFocus
        autoComplete="off"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {error && (
        <p className="form-error" role="alert">
          保存できませんでした。{error}
        </p>
      )}
      <div className="add-card-actions">
        <button type="submit" className="button" disabled={!canSubmit}>
          追加
        </button>
        <button type="button" className="button button--secondary" onClick={close}>
          キャンセル
        </button>
      </div>
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
    </form>
  )
}

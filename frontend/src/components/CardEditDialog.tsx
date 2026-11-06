import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { CardView } from '../api/types'
import { formatDueDateTime } from '../lib/formatDue'
import { fromInputValue, isPast, quickDue, toInputValue } from '../lib/dueInput'
import type { QuickDue } from '../lib/dueInput'

type Mode = 'edit' | 'confirmPast' | 'confirmDelete'

/** 出す失敗の知らせ。kind は、何に失敗したか(保存・削除・入力の読み取り)。 */
type Failure = { kind: 'save' | 'delete' | 'input' | 'checklist'; message: string }

/** チェックリストの項目の文の長さの上限(バックエンドと同じ)。 */
const CHECKLIST_TEXT_MAX_LENGTH = 100

const QUICK_BUTTONS: { kind: QuickDue; label: string }[] = [
  { kind: 'today', label: '今日' },
  { kind: 'tomorrow', label: '明日' },
  { kind: 'nextWeek', label: '来週' },
]

/**
 * カードの編集ダイアログ(画面仕様 カード詳細 §3-⑤)。ボードの上に重ねて出す。スマホでは、下から出る形。
 *   - 期限の変更: 「今日」「明日」「来週」(18:00)、日付と時刻の入力、「期限を消す」、「決定」で保存。
 *     過去の日時のときは、「このままにしますか」と確認する。
 *   - チェックリスト: 項目の「○」を押すと「☑」(完了)に、もう一度押すと「○」に戻る。項目が無いカードにも、欄を出す。
 *     欄の下の入力欄に手順を入れて「追加」(Enter でも可)を押すと、最後に足せる。続けて追加できる。
 *   - 削除: 「このカードを削除」を押すと、確認が出る。「削除する」で、DB から本当に消す(元に戻せない)。
 *   - 保存・削除に失敗したら、ダイアログは開いたまま、理由を出す。入力は残る。
 * 保存・削除・チェックリストの切り替えの通信は、親(onSaveDue / onDelete / onToggleChecklistItem)が行う。成功なら null、失敗なら理由(日本語の文)を返す。
 * 標準の <dialog> 要素を使う: Esc で閉じる、閉じたら元の場所にフォーカスが戻る、背景は操作できない、が標準でつく。
 */
export function CardEditDialog({
  card,
  now = () => new Date(),
  onClose,
  onSaveDue,
  onDelete,
  onToggleChecklistItem,
  onAddChecklistItem,
}: {
  card: CardView
  /** いまの時刻(テストで、固定の時刻に差し替えるため) */
  now?: () => Date
  onClose: () => void
  onSaveDue: (dueAt: string | null) => Promise<string | null>
  onDelete: () => Promise<string | null>
  /** チェックリストの項目の完了を切り替える(done = 切り替えたあとの状態)。 */
  onToggleChecklistItem: (itemId: number, done: boolean) => Promise<string | null>
  /** チェックリストに項目を足す(text は、前後の空白を取り除いた文)。 */
  onAddChecklistItem: (text: string) => Promise<string | null>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // 保存中の目印。state は次の描画まで変わらないので、すばやい二度押しは、ここで防ぐ
  const busyRef = useRef(false)

  const original = card.dueAt ? toInputValue(card.dueAt) : '' // 期限なしは、空
  const [value, setValue] = useState(original)
  const [mode, setMode] = useState<Mode>('edit')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Failure | null>(null)
  // 切り替えの通信中の項目。同じ項目を、二重に押せないようにする(ほかの項目は押せる)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const togglingRef = useRef(false)
  // 項目を足す欄の状態。失敗の知らせは、入力欄のそばに出す(縦に長いダイアログで、見落とさないため)
  const [newItem, setNewItem] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const addingRef = useRef(false)
  const newItemRef = useRef<HTMLInputElement>(null)

  // 開く(背景を暗くして、ほかを操作できなくする)
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const close = () => dialogRef.current?.close()

  /**
   * 保存・削除を、二重に動かさずに行う。成功したら、閉じる。
   * 失敗したら、理由を出す(保存の失敗は、編集の画面へ戻る。削除の失敗は、確認の画面に残る)。
   */
  async function run(kind: 'save' | 'delete', action: () => Promise<string | null>) {
    if (busyRef.current) return
    busyRef.current = true
    setSaving(true)
    setError(null)
    const message = await action()
    busyRef.current = false
    setSaving(false)
    if (message === null) {
      close()
    } else {
      setError({ kind, message })
      if (kind === 'save') setMode('edit')
    }
  }

  /** 項目の完了を切り替える。成功すると、親がカードを置き換えるので、表示(☑ ○、3/5)が変わる。失敗したら、理由を出す。 */
  async function toggleItem(itemId: number, done: boolean) {
    if (togglingRef.current) return
    togglingRef.current = true
    setTogglingId(itemId)
    setError(null)
    const message = await onToggleChecklistItem(itemId, done)
    togglingRef.current = false
    setTogglingId(null)
    if (message !== null) setError({ kind: 'checklist', message })
  }

  /** 項目を足す。成功したら、入力欄を空にして、続けて入力できるようにする。失敗したら、理由を出し、入力した文字は残す。 */
  async function addItem(event: FormEvent) {
    event.preventDefault() // ダイアログの「決定」(期限の保存)とは、別の操作
    const text = newItem.trim()
    if (text === '' || addingRef.current) return
    addingRef.current = true
    setAdding(true)
    setAddError(null)
    const message = await onAddChecklistItem(text)
    addingRef.current = false
    setAdding(false)
    if (message === null) {
      setNewItem('')
      newItemRef.current?.focus()
    } else {
      setAddError(message)
    }
  }

  function save() {
    void run('save', () => onSaveDue(value === '' ? null : fromInputValue(value)))
  }

  function submit() {
    if (busyRef.current) return
    if (value === original) return close() // 変えていないので、何も送らずに閉じる
    if (value !== '' && fromInputValue(value) === null) {
      setError({ kind: 'input', message: '日時を読み取れません。入力し直してください' })
      return
    }
    if (value !== '' && isPast(value, now())) return setMode('confirmPast') // 過去の日時は、確認する
    save()
  }

  const pending = value === '' && original !== '' // 「期限を消す」を押して、まだ保存していない
  const dueLine = card.dueAt
    ? `${formatDueDateTime(card.dueAt)}${['DUE_SOON', 'OVERDUE', 'COMPLETED'].includes(card.dueStatus) ? ` ${card.dueLabel}` : ''}`
    : null

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="edit-dialog-title"
      onClose={onClose}
      // 保存中は、Esc でも、背景のタップでも、閉じない
      onCancel={(event) => {
        if (busyRef.current) event.preventDefault()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && !busyRef.current) close() // 暗い背景をタップしたとき
      }}
    >
      <div className="dialog-body">
        <h2 id="edit-dialog-title" className="dialog-title">
          {mode === 'confirmDelete' ? 'このカードを削除しますか' : 'カードを編集'}
        </h2>
        <p className="dialog-card-title">{card.title}</p>

        {mode === 'confirmPast' && (
          <>
            <p className="dialog-message" role="alert">
              過去の日時です。このままにしますか
            </p>
            <p className="dialog-message">{formatDueDateTime(fromInputValue(value) ?? '')}</p>
            <div className="dialog-actions">
              <button type="button" className="button" onClick={save} disabled={saving}>
                このまま保存
              </button>
              <button type="button" className="button button--secondary" onClick={() => setMode('edit')} disabled={saving}>
                選び直す
              </button>
            </div>
          </>
        )}

        {mode === 'confirmDelete' && (
          <>
            <p className="dialog-message" role="alert">
              「{card.title}」を削除します。チェックリストも一緒に消え、<strong>元に戻せません</strong>。
            </p>
            {error?.kind === 'delete' && (
              <p className="form-error" role="alert">
                削除できませんでした。{error.message}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="button button--danger"
                onClick={() => void run('delete', onDelete)}
                disabled={saving}
              >
                削除する
              </button>
              {/* 迷ったときに、誤って消さないよう、「やめる」に、最初のフォーカスを置く */}
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setMode('edit')}
                disabled={saving}
                autoFocus
              >
                やめる
              </button>
            </div>
          </>
        )}

        {mode === 'edit' && (
          <>
            <section className="dialog-section" aria-label="チェックリスト">
              <h3 className="dialog-section-title">
                チェックリスト{card.checklist.length > 0 && `(${card.checklistDone}/${card.checklistTotal} 完了)`}
              </h3>
              {card.checklist.length === 0 ? (
                <p className="dialog-message">チェックリストは、まだありません。下の欄から追加できます</p>
              ) : (
                <ul className="dialog-checklist">
                  {card.checklist.map((item) => (
                    <li key={item.id}>
                      {/* 状態は、記号(☑ ○)と、押された状態(aria-pressed)で伝える。色だけに頼らない */}
                      <button
                        type="button"
                        className={`checklist-toggle${item.done ? ' checklist-toggle--done' : ''}`}
                        aria-pressed={item.done}
                        onClick={() => void toggleItem(item.id, !item.done)}
                        disabled={togglingId === item.id}
                      >
                        <span aria-hidden="true">{item.done ? '☑' : '○'}</span>
                        <span>{item.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form className="checklist-add" aria-label="チェックリストの項目を追加" onSubmit={(event) => void addItem(event)}>
                <input
                  ref={newItemRef}
                  type="text"
                  className="dialog-input"
                  aria-label="チェックリストの項目"
                  placeholder="手順を入力(例: 見積書を送る)"
                  maxLength={CHECKLIST_TEXT_MAX_LENGTH}
                  autoComplete="off"
                  value={newItem}
                  readOnly={adding}
                  onChange={(event) => {
                    setNewItem(event.target.value)
                    setAddError(null)
                  }}
                />
                <button type="submit" className="button" disabled={newItem.trim() === '' || adding}>
                  追加
                </button>
              </form>
              {addError && (
                <p className="form-error" role="alert">
                  項目を追加できませんでした。{addError}
                </p>
              )}
            </section>

            <section className="dialog-section" aria-label="期限">
              <h3 className="dialog-section-title">期限</h3>
              {dueLine ? (
                <p className={`dialog-due card-due card-due--${card.dueStatus.toLowerCase()}`}>
                  <span aria-hidden="true">{card.dueIcon}</span> {dueLine}
                </p>
              ) : (
                <p className="dialog-message">期限なし</p>
              )}

              <div className="dialog-quick" role="group" aria-label="期限のクイック選択(18:00)">
                {QUICK_BUTTONS.map(({ kind, label }) => (
                  <button
                    key={kind}
                    type="button"
                    className="button button--secondary"
                    onClick={() => {
                      setValue(quickDue(kind, now()))
                      setError(null)
                    }}
                    disabled={saving}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="dialog-field">
                <span>日付と時刻</span>
                <input
                  type="datetime-local"
                  className="dialog-input"
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value)
                    setError(null)
                  }}
                  disabled={saving}
                />
              </label>

              {pending && <p className="dialog-message">期限を消します。「決定」を押すと、保存されます。</p>}

              <button
                type="button"
                className="button button--secondary"
                onClick={() => setValue('')}
                disabled={saving || value === ''}
              >
                期限を消す
              </button>
            </section>

            {error && error.kind !== 'delete' && (
              <p className="form-error" role="alert">
                {error.kind === 'save'
                  ? `保存できませんでした。${error.message}`
                  : error.kind === 'checklist'
                    ? `チェックリストを更新できませんでした。${error.message}`
                    : error.message}
              </p>
            )}

            <div className="dialog-actions">
              <button type="button" className="button" onClick={submit} disabled={saving}>
                決定
              </button>
              <button type="button" className="button button--secondary" onClick={close} disabled={saving}>
                キャンセル
              </button>
            </div>

            <section className="dialog-section dialog-danger" aria-label="削除">
              <button
                type="button"
                className="button button--danger-outline"
                onClick={() => {
                  setError(null)
                  setMode('confirmDelete')
                }}
                disabled={saving}
              >
                このカードを削除
              </button>
            </section>
          </>
        )}
      </div>
    </dialog>
  )
}

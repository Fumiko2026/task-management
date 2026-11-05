import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * 「〜しますか」と、確認するダイアログ。ボードの上に重ねて出す(スマホでは下から出る形)。
 * 編集ダイアログと同じ、標準の <dialog> を使う: Esc で閉じる、背景は操作できない、閉じたら元の場所にフォーカスが戻る。
 *   - 確認のボタンを押したら onConfirm。
 *   - キャンセルのボタン、Esc、暗い背景を押したら onCancel。
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'やめる',
  onConfirm,
  onCancel,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  // 確認のボタンを押して閉じるときは、onCancel を呼ばないための目印
  const confirmedRef = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    // 開いたあとに、確認のボタンへ、明示的にフォーカスを置く(どの環境でも、確実にそろえるため)
    confirmRef.current?.focus()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="confirm-dialog-title"
      // Esc や、「やめる」で閉じたとき
      onClose={() => {
        if (!confirmedRef.current) onCancel()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close() // 暗い背景をタップしたとき
      }}
    >
      <div className="dialog-body">
        <h2 id="confirm-dialog-title" className="dialog-title">
          {title}
        </h2>
        <div className="dialog-message">{children}</div>
        <div className="dialog-actions">
          <button
            ref={confirmRef}
            type="button"
            className="button"
            onClick={() => {
              confirmedRef.current = true
              onConfirm()
              dialogRef.current?.close()
            }}
          >
            {confirmLabel}
          </button>
          <button type="button" className="button button--secondary" onClick={() => dialogRef.current?.close()}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}

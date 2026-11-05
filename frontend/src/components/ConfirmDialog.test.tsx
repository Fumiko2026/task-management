import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

function setup() {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog title="チェックリストが残っています" confirmLabel="完了にする" onConfirm={onConfirm} onCancel={onCancel}>
      <p>あと 2 件あります。完了にしますか</p>
    </ConfirmDialog>,
  )
  return { onConfirm, onCancel, user: userEvent.setup() }
}

describe('ConfirmDialog', () => {
  it('開いた状態で、題と、本文と、2 つのボタンが出る。最初のフォーカスは、確認のボタン', () => {
    setup()

    const dialog = screen.getByRole('dialog', { name: 'チェックリストが残っています' })
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveTextContent('あと 2 件あります。完了にしますか')
    expect(screen.getByRole('button', { name: '完了にする' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'やめる' })).toBeInTheDocument()
  })

  it('確認のボタンを押すと onConfirm が呼ばれ、onCancel は呼ばれない', async () => {
    const { user, onConfirm, onCancel } = setup()

    await user.click(screen.getByRole('button', { name: '完了にする' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('「やめる」を押すと onCancel が呼ばれ、onConfirm は呼ばれない', async () => {
    const { user, onConfirm, onCancel } = setup()

    await user.click(screen.getByRole('button', { name: 'やめる' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Esc(閉じる)や、暗い背景を押したときも、onCancel(確認は、していない)', () => {
    const { onConfirm, onCancel } = setup()

    screen.getByRole('dialog').dispatchEvent(new Event('close')) // Esc で閉じたとき
    fireEvent.click(screen.getByRole('dialog')) // 暗い背景(ダイアログ自身)が押されたとき

    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('中身(本文)を押しても、閉じない', async () => {
    const { user, onCancel } = setup()

    await user.click(screen.getByText('あと 2 件あります。完了にしますか'))

    expect(onCancel).not.toHaveBeenCalled()
  })
})

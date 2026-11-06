import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CardView } from '../api/types'
import { makeCard } from '../test/fixtures'
import { CardEditDialog } from './CardEditDialog'

// いまは、2026-11-10 12:00(日本時間)に固定
const NOW = new Date('2026-11-10T12:00:00+09:00')

const withDue: CardView = makeCard({
  id: 7,
  title: '見積書を作る',
  dueAt: '2026-11-10T18:00:00+09:00',
  dueStatus: 'DUE_SOON',
  dueIcon: '⏰',
  dueLabel: 'もうすぐ',
})

function setup(card: CardView = withDue, overrides: { onSaveDue?: () => Promise<string | null>; onDelete?: () => Promise<string | null> } = {}) {
  const onClose = vi.fn()
  const onSaveDue = vi.fn(overrides.onSaveDue ?? (() => Promise.resolve(null)))
  const onDelete = vi.fn(overrides.onDelete ?? (() => Promise.resolve(null)))
  render(<CardEditDialog card={card} now={() => NOW} onClose={onClose} onSaveDue={onSaveDue} onDelete={onDelete} />)
  return { onClose, onSaveDue, onDelete, user: userEvent.setup() }
}

const input = () => screen.getByLabelText('日付と時刻') as HTMLInputElement
const press = (name: string) => screen.getByRole('button', { name })

describe('CardEditDialog: 開いたとき', () => {
  it('開いた状態(モーダル)で、カードのタイトルと、いまの期限が、アイコンと日時つきで出る', () => {
    setup()

    const dialog = screen.getByRole('dialog', { name: 'カードを編集' })
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveTextContent('見積書を作る')
    expect(dialog).toHaveTextContent('⏰ 11/10(火) 18:00 もうすぐ')
    expect(input().value).toBe('2026-11-10T18:00')
  })

  it('期限なしのカードは、「期限なし」と出て、入力欄は空', () => {
    setup(makeCard({ dueAt: null, dueStatus: 'NONE' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('期限なし')
    expect(input().value).toBe('')
  })

  it('チェックリストの項目が、順番どおりに、「完了」「未完了」つきで出る', () => {
    setup(
      makeCard({
        checklistDone: 2,
        checklistTotal: 3,
        checklist: [
          { id: 1, text: '取引先の情報を集める', done: true },
          { id: 2, text: '金額を計算する', done: true },
          { id: 3, text: '上司に確認する', done: false },
        ],
      }),
    )

    const section = screen.getByRole('region', { name: 'チェックリスト' })
    expect(section).toHaveTextContent('2/3 完了')
    const items = within(section).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      '✔完了取引先の情報を集める',
      '✔完了金額を計算する',
      '○未完了上司に確認する',
    ])
  })

  it('チェックリストが無いカードには、チェックリストの欄を出さない', () => {
    setup(makeCard({ checklist: [], checklistTotal: 0 }))

    expect(screen.queryByRole('region', { name: 'チェックリスト' })).not.toBeInTheDocument()
  })

  it('操作の部品は、押しやすい形で、そろっている', () => {
    setup()

    for (const name of ['今日', '明日', '来週', '期限を消す', '決定', 'キャンセル', 'このカードを削除']) {
      expect(press(name)).toBeInTheDocument()
    }
  })
})

describe('CardEditDialog: 期限の変更', () => {
  it('クイック選択で、日本時間の 18:00 が入る(今日・明日・来週)', async () => {
    const { user } = setup()

    await user.click(press('今日'))
    expect(input().value).toBe('2026-11-10T18:00')
    await user.click(press('明日'))
    expect(input().value).toBe('2026-11-11T18:00')
    await user.click(press('来週'))
    expect(input().value).toBe('2026-11-17T18:00')
  })

  it('「決定」で、+09:00 つきの日時を、保存の処理に渡し、成功したら閉じる', async () => {
    const { user, onSaveDue, onClose } = setup()

    await user.click(press('明日'))
    await user.click(press('決定'))

    expect(onSaveDue).toHaveBeenCalledWith('2026-11-11T18:00:00+09:00')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('入力欄に直接入れた日時も、保存できる', async () => {
    const { user, onSaveDue } = setup()

    fireEvent.change(input(), { target: { value: '2026-12-24T09:30' } })
    await user.click(press('決定'))

    expect(onSaveDue).toHaveBeenCalledWith('2026-12-24T09:30:00+09:00')
  })

  it('何も変えずに「決定」を押したら、何も送らずに閉じる', async () => {
    const { user, onSaveDue, onClose } = setup()

    await user.click(press('決定'))

    expect(onSaveDue).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('「期限を消す」は、まだ保存せず、「決定」で null を渡す', async () => {
    const { user, onSaveDue } = setup()

    await user.click(press('期限を消す'))
    expect(input().value).toBe('')
    expect(screen.getByText('期限を消します。「決定」を押すと、保存されます。')).toBeInTheDocument()
    expect(onSaveDue).not.toHaveBeenCalled()

    await user.click(press('決定'))
    expect(onSaveDue).toHaveBeenCalledWith(null)
  })

  it('「期限を消す」のあとでも、日時を選び直せる', async () => {
    const { user, onSaveDue } = setup()

    await user.click(press('期限を消す'))
    await user.click(press('明日'))
    await user.click(press('決定'))

    expect(onSaveDue).toHaveBeenCalledWith('2026-11-11T18:00:00+09:00')
  })
})

describe('CardEditDialog: 過去の日時', () => {
  it('過去の日時で「決定」を押すと、確認が出て、まだ保存しない', async () => {
    const { user, onSaveDue } = setup()

    fireEvent.change(input(), { target: { value: '2026-11-09T09:00' } })
    await user.click(press('決定'))

    expect(screen.getByRole('alert')).toHaveTextContent('過去の日時です。このままにしますか')
    expect(onSaveDue).not.toHaveBeenCalled()
  })

  it('「選び直す」で、入力に戻り、入れた日時は残っている', async () => {
    const { user } = setup()
    fireEvent.change(input(), { target: { value: '2026-11-09T09:00' } })
    await user.click(press('決定'))

    await user.click(press('選び直す'))

    expect(press('決定')).toBeInTheDocument()
    expect(input().value).toBe('2026-11-09T09:00')
  })

  it('「このまま保存」で、保存する', async () => {
    const { user, onSaveDue, onClose } = setup()
    fireEvent.change(input(), { target: { value: '2026-11-09T09:00' } })
    await user.click(press('決定'))

    await user.click(press('このまま保存'))

    expect(onSaveDue).toHaveBeenCalledWith('2026-11-09T09:00:00+09:00')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('CardEditDialog: 保存の失敗と、二重送信', () => {
  it('失敗したら、閉じずに、理由を出す。入力した日時は残り、もう一度できる', async () => {
    const onSaveDue = vi.fn().mockResolvedValueOnce('サーバーの調子が悪いようです').mockResolvedValueOnce(null)
    const { user, onClose } = setup(withDue, { onSaveDue })

    await user.click(press('明日'))
    await user.click(press('決定'))

    expect(await screen.findByRole('alert')).toHaveTextContent('保存できませんでした。サーバーの調子が悪いようです')
    expect(onClose).not.toHaveBeenCalled()
    expect(input().value).toBe('2026-11-11T18:00')

    await user.click(press('決定'))
    expect(onSaveDue).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('保存の途中で、もう一度押しても、二重には送らない。ボタンも押せなくなる', async () => {
    let finish: (message: string | null) => void = () => {}
    const onSaveDue = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)))
    const { user, onClose } = setup(withDue, { onSaveDue })

    await user.click(press('明日'))
    await user.click(press('決定'))
    expect(press('決定')).toBeDisabled()
    expect(press('キャンセル')).toBeDisabled()
    await user.click(press('決定'))

    expect(onSaveDue).toHaveBeenCalledTimes(1)
    finish(null)
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('保存の途中は、Esc(cancel)でも、閉じない', async () => {
    const onSaveDue = vi.fn(() => new Promise<string | null>(() => {}))
    const { user } = setup(withDue, { onSaveDue })
    await user.click(press('明日'))
    await user.click(press('決定'))

    const cancel = new Event('cancel', { cancelable: true })
    screen.getByRole('dialog').dispatchEvent(cancel)

    expect(cancel.defaultPrevented).toBe(true)
  })
})

describe('CardEditDialog: 閉じ方', () => {
  it('「キャンセル」は、保存せずに閉じる', async () => {
    const { user, onSaveDue, onClose } = setup()

    await user.click(press('明日'))
    await user.click(press('キャンセル'))

    expect(onSaveDue).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('暗い背景(ダイアログの外側)を押すと閉じる。中身を押しても、閉じない', async () => {
    const { user, onClose } = setup()

    await user.click(screen.getByText('見積書を作る'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('dialog')) // ダイアログ自身(背景)が、押されたとき
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('CardEditDialog: 削除', () => {
  it('「このカードを削除」で、確認が出る。まだ消さない。「元に戻せません」と書いてあり、最初のフォーカスは「やめる」', async () => {
    const { user, onDelete } = setup()

    await user.click(press('このカードを削除'))

    const dialog = screen.getByRole('dialog', { name: 'このカードを削除しますか' })
    expect(dialog).toHaveTextContent('「見積書を作る」を削除します。チェックリストも一緒に消え、元に戻せません。')
    expect(press('やめる')).toHaveFocus()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('「やめる」で、編集に戻る(消さない)', async () => {
    const { user, onDelete } = setup()
    await user.click(press('このカードを削除'))

    await user.click(press('やめる'))

    expect(press('決定')).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('「削除する」で、削除の処理を呼び、成功したら閉じる', async () => {
    const { user, onDelete, onClose } = setup()
    await user.click(press('このカードを削除'))

    await user.click(press('削除する'))

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('削除に失敗したら、確認の画面に残り、「削除できませんでした。(理由)」を出す', async () => {
    const onDelete = vi.fn().mockResolvedValueOnce('サーバーの調子が悪いようです')
    const { user, onClose } = setup(withDue, { onDelete })
    await user.click(press('このカードを削除'))

    await user.click(press('削除する'))

    expect(await screen.findByText('削除できませんでした。サーバーの調子が悪いようです')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('このカードを削除しますか')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('削除の途中で、もう一度押しても、二重には送らない', async () => {
    let finish: (message: string | null) => void = () => {}
    const onDelete = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)))
    const { user, onClose } = setup(withDue, { onDelete })
    await user.click(press('このカードを削除'))

    await user.click(press('削除する'))
    expect(press('削除する')).toBeDisabled()
    await user.click(press('削除する'))

    expect(onDelete).toHaveBeenCalledTimes(1)
    finish(null)
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})

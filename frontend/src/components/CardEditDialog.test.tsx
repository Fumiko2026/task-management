import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

function setup(
  card: CardView = withDue,
  overrides: {
    onSaveDue?: () => Promise<string | null>
    onDelete?: () => Promise<string | null>
    onToggleChecklistItem?: (itemId: number, done: boolean) => Promise<string | null>
    onAddChecklistItem?: (text: string) => Promise<string | null>
  } = {},
) {
  const onClose = vi.fn()
  const onSaveDue = vi.fn(overrides.onSaveDue ?? (() => Promise.resolve(null)))
  const onDelete = vi.fn(overrides.onDelete ?? (() => Promise.resolve(null)))
  const onToggleChecklistItem = vi.fn(overrides.onToggleChecklistItem ?? (() => Promise.resolve(null)))
  const onAddChecklistItem = vi.fn(overrides.onAddChecklistItem ?? (() => Promise.resolve(null)))
  render(
    <CardEditDialog
      card={card}
      now={() => NOW}
      onClose={onClose}
      onSaveDue={onSaveDue}
      onDelete={onDelete}
      onToggleChecklistItem={onToggleChecklistItem}
      onAddChecklistItem={onAddChecklistItem}
    />,
  )
  return { onClose, onSaveDue, onDelete, onToggleChecklistItem, onAddChecklistItem, user: userEvent.setup() }
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

const checklistCard: CardView = makeCard({
  id: 7,
  title: '見積書を作る',
  checklistDone: 2,
  checklistTotal: 3,
  checklist: [
    { id: 11, text: '取引先の情報を集める', done: true },
    { id: 12, text: '金額を計算する', done: true },
    { id: 13, text: '上司に確認する', done: false },
  ],
})

describe('CardEditDialog: チェックリスト', () => {
  it('項目が、順番どおりに、完了は「☑」、未完了は「○」で出て、進み具合も出る', () => {
    setup(checklistCard)

    const section = screen.getByRole('region', { name: 'チェックリスト' })
    expect(section).toHaveTextContent('2/3 完了')
    const items = Array.from(section.querySelectorAll('button[aria-pressed]'))
    expect(items.map((item) => item.textContent)).toEqual([
      '☑取引先の情報を集める',
      '☑金額を計算する',
      '○上司に確認する',
    ])
    // 状態は、記号だけでなく、読み上げにも伝わる(押された状態 = 完了)
    expect(items.map((item) => item.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'false'])
  })

  it('項目が無いカードでも、チェックリストの欄が出て、「まだありません」と出る', () => {
    setup(makeCard({ checklist: [], checklistTotal: 0 }))

    const section = screen.getByRole('region', { name: 'チェックリスト' })
    expect(section).toHaveTextContent('チェックリストは、まだありません')
    expect(section).toHaveTextContent('下の欄から追加できます')
    expect(section.querySelectorAll('.checklist-toggle')).toHaveLength(0)
  })

  it('○を押すと、その項目を完了(true)にする依頼が出る', async () => {
    const { user, onToggleChecklistItem } = setup(checklistCard)

    await user.click(screen.getByRole('button', { name: '上司に確認する' }))

    expect(onToggleChecklistItem).toHaveBeenCalledExactlyOnceWith(13, true)
  })

  it('☑を押すと、その項目を未完了(false)に戻す依頼が出る', async () => {
    const { user, onToggleChecklistItem } = setup(checklistCard)

    await user.click(screen.getByRole('button', { name: '金額を計算する' }))

    expect(onToggleChecklistItem).toHaveBeenCalledExactlyOnceWith(12, false)
  })

  it('押している間は、その項目をもう一度押せない(二重に送らない)。終わったら、ダイアログは開いたまま', async () => {
    let finish: (message: string | null) => void = () => {}
    const { user, onToggleChecklistItem, onClose } = setup(checklistCard, {
      onToggleChecklistItem: () => new Promise((resolve) => (finish = resolve)),
    })

    const item = screen.getByRole('button', { name: '上司に確認する' })
    await user.click(item)
    await user.click(item)
    expect(onToggleChecklistItem).toHaveBeenCalledTimes(1)
    expect(item).toBeDisabled()

    finish(null)
    await waitFor(() => expect(item).toBeEnabled())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAttribute('open')
  })

  it('失敗したら、理由を出し、ダイアログは開いたまま(項目の表示は変えない)', async () => {
    const { user } = setup(checklistCard, {
      onToggleChecklistItem: () => Promise.resolve('通信できませんでした'),
    })

    await user.click(screen.getByRole('button', { name: '上司に確認する' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('チェックリストを更新できませんでした。通信できませんでした')
    expect(screen.getByRole('button', { name: '上司に確認する' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('dialog')).toHaveAttribute('open')
  })

  it('項目のボタンは、押しやすい大きさの部品として出る', () => {
    setup(checklistCard)

    const toggles = screen.getByRole('region', { name: 'チェックリスト' }).querySelectorAll('button[aria-pressed]')
    expect(toggles).toHaveLength(3)
    for (const button of toggles) expect(button).toHaveClass('checklist-toggle')
  })
})

describe('CardEditDialog: チェックリストの項目を追加する', () => {
  const field = () => screen.getByLabelText('チェックリストの項目') as HTMLInputElement
  const addButton = () => within(screen.getByRole('form', { name: 'チェックリストの項目を追加' })).getByRole('button', { name: '追加' })

  it('項目が無いカードにも、項目がある カードにも、入力欄と「追加」ボタンがある(入力欄は100文字まで)', () => {
    const { unmount } = render(
      <CardEditDialog card={makeCard()} onClose={vi.fn()} onSaveDue={vi.fn()} onDelete={vi.fn()} onToggleChecklistItem={vi.fn()} onAddChecklistItem={vi.fn()} />,
    )
    expect(field()).toHaveAttribute('maxlength', '100')
    expect(addButton()).toBeInTheDocument()
    unmount()

    setup(checklistCard)
    expect(field()).toBeInTheDocument()
    expect(addButton()).toBeInTheDocument()
  })

  it('空・空白だけのときは、「追加」を押せない', async () => {
    const { user } = setup(checklistCard)
    expect(addButton()).toBeDisabled()

    await user.type(field(), '   ')
    expect(addButton()).toBeDisabled()

    await user.type(field(), 'あ')
    expect(addButton()).toBeEnabled()
  })

  it('入れて「追加」を押すと、前後の空白を取り除いて依頼が出る。成功したら、入力欄は空になり、開いたまま、続けて入力できる', async () => {
    const { user, onAddChecklistItem, onClose } = setup(checklistCard)

    await user.type(field(), '  見積書を送る ')
    await user.click(addButton())

    expect(onAddChecklistItem).toHaveBeenCalledExactlyOnceWith('見積書を送る')
    await waitFor(() => expect(field().value).toBe(''))
    expect(field()).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAttribute('open')
  })

  it('Enter キーでも追加できる(ダイアログの「決定」は押されない)', async () => {
    const { user, onAddChecklistItem, onSaveDue } = setup(checklistCard)

    await user.type(field(), '見積書を送る{Enter}')

    expect(onAddChecklistItem).toHaveBeenCalledExactlyOnceWith('見積書を送る')
    expect(onSaveDue).not.toHaveBeenCalled()
  })

  it('送っている間は、もう一度押せず(二重に送らない)、入力欄も触れない', async () => {
    let finish: (message: string | null) => void = () => {}
    const { user, onAddChecklistItem } = setup(checklistCard, {
      onAddChecklistItem: () => new Promise((resolve) => (finish = resolve)),
    })

    await user.type(field(), '見積書を送る')
    await user.click(addButton())
    await user.click(addButton())
    expect(onAddChecklistItem).toHaveBeenCalledTimes(1)
    expect(addButton()).toBeDisabled()
    expect(field()).toHaveAttribute('readonly') // 送っている間は、書き換えられない(フォーカスは外れない)

    finish(null)
    await waitFor(() => expect(addButton()).toBeDisabled()) // 送り終わり、入力欄は空になるので、まだ押せない
    expect(field().value).toBe('')
  })

  it('失敗したら、理由を入力欄の近くに出し、入力した文字は残す', async () => {
    const { user } = setup(checklistCard, {
      onAddChecklistItem: () => Promise.resolve('項目は100文字までです'),
    })

    await user.type(field(), '見積書を送る')
    await user.click(addButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('項目を追加できませんでした。項目は100文字までです')
    expect(field().value).toBe('見積書を送る')
    expect(screen.getByRole('dialog')).toHaveAttribute('open')
  })

  it('入力し直すと、前の失敗の知らせは消える', async () => {
    const { user } = setup(checklistCard, { onAddChecklistItem: () => Promise.resolve('通信できませんでした') })

    await user.type(field(), 'あ')
    await user.click(addButton())
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.type(field(), 'い')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

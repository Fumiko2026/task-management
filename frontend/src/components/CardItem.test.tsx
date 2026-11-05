import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeCard } from '../test/fixtures'
import { CardItem } from './CardItem'

describe('CardItem', () => {
  it('タイトルと担当者の名前を出す', () => {
    render(<CardItem card={makeCard({ title: '資料を送る', assignee: { id: 2, name: '田中さん', self: false } })} />)

    expect(screen.getByRole('heading', { name: '資料を送る' })).toBeInTheDocument()
    expect(screen.getByText('👤 田中さん')).toBeInTheDocument()
  })

  it('担当者がいないときは、「担当者なし」の警告を出す', () => {
    render(<CardItem card={makeCard({ assignee: null, assigneeMissing: true })} />)

    expect(screen.getByText('⚠ 担当者なし')).toBeInTheDocument()
  })

  it('期限が超過のとき、アイコンと日付と文字を出す(色だけに頼らない)', () => {
    const card = makeCard({
      dueAt: '2026-10-25T10:00:00+09:00',
      dueStatus: 'OVERDUE',
      dueIcon: '❗',
      dueLabel: '超過',
    })
    const { container } = render(<CardItem card={card} />)

    expect(screen.getByText(/10\/25 超過/)).toBeInTheDocument()
    expect(container.querySelector('.card-due')).toHaveTextContent('❗ 10/25 超過')
  })

  it('期限が「もうすぐ」のとき、アイコンと文字を出す', () => {
    const card = makeCard({
      dueAt: '2026-10-28T09:00:00+09:00',
      dueStatus: 'DUE_SOON',
      dueIcon: '⏰',
      dueLabel: 'もうすぐ',
    })
    const { container } = render(<CardItem card={card} />)

    expect(container.querySelector('.card-due')).toHaveTextContent('⏰ 10/28 もうすぐ')
  })

  it('期限が通常のとき、日付だけを出す(「通常」の文字は出さない)', () => {
    const card = makeCard({
      dueAt: '2026-11-06T09:00:00+09:00',
      dueStatus: 'NORMAL',
      dueIcon: '🕒',
      dueLabel: '通常',
    })
    const { container } = render(<CardItem card={card} />)

    expect(container.querySelector('.card-due')).toHaveTextContent('🕒 11/6')
    expect(screen.queryByText(/通常/)).not.toBeInTheDocument()
  })

  it('期限がないときは、期限の欄を出さない', () => {
    const { container } = render(<CardItem card={makeCard({ dueStatus: 'NONE' })} />)

    expect(container.querySelector('.card-due')).not.toBeInTheDocument()
  })

  it('完了したカードは、✔ と「完了」を出す', () => {
    const card = makeCard({
      dueAt: '2026-11-02T06:00:00+09:00',
      dueStatus: 'COMPLETED',
      dueIcon: '✔',
      dueLabel: '完了',
      completedAt: '2026-11-02T04:00:00+09:00',
    })
    const { container } = render(<CardItem card={card} />)

    expect(screen.getByRole('img', { name: '完了済み' })).toHaveTextContent('✔')
    expect(container.querySelector('.card-due')).toHaveTextContent('✔ 完了')
  })

  it('未完了のカードは、○ を出す', () => {
    render(<CardItem card={makeCard()} />)

    expect(screen.getByRole('img', { name: '未完了' })).toHaveTextContent('○')
  })

  it('チェックリストの進み具合(3/5)を、数と進捗バーで出す', () => {
    render(<CardItem card={makeCard({ checklistDone: 3, checklistTotal: 5 })} />)

    expect(screen.getByText('☑ 3/5')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('max', '5')
    expect(bar).toHaveAttribute('value', '3')
  })

  it('チェックリストが0件のときは、出さない', () => {
    render(<CardItem card={makeCard({ checklistTotal: 0 })} />)

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/☑/)).not.toBeInTheDocument()
  })
})

describe('CardItem: 完了マーク(○/✔)のボタン', () => {
  it('onToggleComplete があると、完了マークが、押せるボタンになる(カード名つきの名前)', async () => {
    const onToggleComplete = vi.fn()
    const card = makeCard({ title: '見積書を作る' })
    render(<CardItem card={card} onToggleComplete={onToggleComplete} />)

    await userEvent.click(screen.getByRole('button', { name: '完了にする: 見積書を作る' }))

    expect(onToggleComplete).toHaveBeenCalledTimes(1)
    expect(onToggleComplete).toHaveBeenCalledWith(card)
  })

  it('完了済みのカードは、✔ のボタンで、名前は「未完了に戻す: カード名」', () => {
    const card = makeCard({ title: '契約書の確認', completedAt: '2026-11-02T04:00:00+09:00' })
    render(<CardItem card={card} onToggleComplete={vi.fn()} />)

    expect(screen.getByRole('button', { name: '未完了に戻す: 契約書の確認' })).toHaveTextContent('✔')
  })

  it('ボタンを押したことが、外側(ドラッグの部品・カードを開く処理)に伝わらない', () => {
    const outer = { click: vi.fn(), mouseDown: vi.fn(), touchStart: vi.fn(), pointerDown: vi.fn(), keyDown: vi.fn() }
    render(
      <div
        onClick={outer.click}
        onMouseDown={outer.mouseDown}
        onTouchStart={outer.touchStart}
        onPointerDown={outer.pointerDown}
        onKeyDown={outer.keyDown}
      >
        <CardItem card={makeCard({ title: '見積書を作る' })} onToggleComplete={vi.fn()} />
      </div>,
    )
    const button = screen.getByRole('button', { name: '完了にする: 見積書を作る' })

    fireEvent.mouseDown(button)
    fireEvent.touchStart(button)
    fireEvent.pointerDown(button)
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyDown(button, { key: ' ' })
    fireEvent.click(button)

    for (const [name, handler] of Object.entries(outer)) {
      expect(handler, name).not.toHaveBeenCalled()
    }
  })

  it('onToggleComplete が無いとき(ドラッグ中に浮いているカードなど)は、押せない表示だけ', () => {
    render(<CardItem card={makeCard()} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: '未完了' })).toHaveTextContent('○')
  })
})

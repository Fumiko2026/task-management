import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BoardView } from '../api/types'
import { makeBoard, makeList } from '../test/fixtures'
import { BoardPage } from './BoardPage'

/** API の応答(JSON)を作る。 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
  })
}

describe('BoardPage', () => {
  it('読み込み中は「読み込み中」を出し、読み込めたらボードを出す', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeBoard()))
    vi.stubGlobal('fetch', fetchMock)

    render(<BoardPage />)
    expect(screen.getByRole('status')).toHaveTextContent('読み込み中')

    expect(await screen.findByRole('heading', { level: 1, name: 'はじめてのボード' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/board', expect.anything())
  })

  it('リストを並び順どおりに、件数つきで出す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(makeBoard())))

    render(<BoardPage />)

    const lists = await screen.findAllByRole('region')
    expect(lists.map((list) => list.getAttribute('aria-label'))).toEqual(['未着手', '進行中', 'レビュー', '完了'])

    const todo = within(lists[0])
    expect(todo.getByRole('heading', { name: '未着手' })).toBeInTheDocument()
    expect(todo.getByLabelText('2件')).toBeInTheDocument()
    expect(todo.getByRole('heading', { name: '見積書を作る' })).toBeInTheDocument()
    expect(todo.getByRole('heading', { name: '資料をまとめる' })).toBeInTheDocument()
  })

  it('カードのない列には、「カードはありません」を出す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(makeBoard())))

    render(<BoardPage />)

    const review = within(await screen.findByRole('region', { name: 'レビュー' }))
    expect(review.getByText('カードはありません')).toBeInTheDocument()
  })

  it('カードの期限・担当者・チェックリストを、ボードの上に出す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(makeBoard())))

    render(<BoardPage />)

    expect(await screen.findByText(/11\/2 超過/)).toBeInTheDocument()
    expect(screen.getByText(/11\/3 もうすぐ/)).toBeInTheDocument()
    expect(screen.getByText('⚠ 担当者なし')).toBeInTheDocument()
    expect(screen.getByText('☑ 3/5')).toBeInTheDocument()
    expect(screen.getByText('👤 田中さん')).toBeInTheDocument()
  })

  it('カードが1枚もないボードでは、案内を出す', async () => {
    const empty: BoardView = {
      id: 1,
      name: 'はじめてのボード',
      lists: [makeList({ id: 1, name: '未着手' }), makeList({ id: 2, name: '進行中', position: 2 })],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(empty)))

    render(<BoardPage />)

    expect(await screen.findByText('最初のカードを追加しましょう')).toBeInTheDocument()
  })

  it('読み込めなかったら、「読み込めませんでした」を出し、「もう一度試す」で読み直せる', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
    vi.stubGlobal('fetch', fetchMock)

    render(<BoardPage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('読み込めませんでした')
    expect(alert).toHaveTextContent('通信できませんでした')

    await userEvent.click(screen.getByRole('button', { name: 'もう一度試す' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'はじめてのボード' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('サーバーのエラー(500)でも、理由を出して「もう一度試す」を出す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })))

    render(<BoardPage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('エラーが起きました(500)')
    expect(within(alert).getByRole('button', { name: 'もう一度試す' })).toBeInTheDocument()
  })

  it('ボードが無いとき(404)は、API の理由をそのまま出す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'ボードがありません' }, 404)))

    render(<BoardPage />)

    expect(await screen.findByText('ボードがありません')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

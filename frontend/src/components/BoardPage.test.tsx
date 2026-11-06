import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BoardView } from '../api/types'
import { moveCardInBoard, replaceCard } from '../lib/boardMove'
import { jsonResponse, makeBoard, makeCard, makeList } from '../test/fixtures'
import { BoardPage } from './BoardPage'

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
    expect(lists.map((list) => list.getAttribute('aria-label'))).toEqual(['未着手', '進行中', '完了'])

    const todo = within(lists[0])
    expect(todo.getByRole('heading', { name: '未着手' })).toBeInTheDocument()
    expect(todo.getByLabelText('2件')).toBeInTheDocument()
    expect(todo.getByRole('heading', { name: '見積書を作る' })).toBeInTheDocument()
    expect(todo.getByRole('heading', { name: '資料をまとめる' })).toBeInTheDocument()
  })

  it('カードのない列には、「カードはありません」を出す', async () => {
    const board = makeBoard()
    board.lists[1] = makeList({ id: 2, name: '進行中', position: 2, cards: [] }) // 進行中を、空にする
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(board)))

    render(<BoardPage />)

    const doing = within(await screen.findByRole('region', { name: '進行中' }))
    expect(doing.getByText('カードはありません')).toBeInTheDocument()
  })

  it('「完了」は、いちばん最後(進行中の右)に出る', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(makeBoard())))

    render(<BoardPage />)

    const names = (await screen.findAllByRole('region')).map((list) => list.getAttribute('aria-label'))
    expect(names.indexOf('完了')).toBe(names.indexOf('進行中') + 1)
    expect(names.at(-1)).toBe('完了')
    expect(names).not.toContain('レビュー')
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

  describe('カードの追加', () => {
    const addLabel = '＋ カードを追加'

    it('「完了」のリストには、「カードを追加」を出さない', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(makeBoard())))

      render(<BoardPage />)

      for (const name of ['未着手', '進行中']) {
        const region = within(await screen.findByRole('region', { name }))
        expect(region.getByRole('button', { name: addLabel })).toBeInTheDocument()
      }
      const done = within(screen.getByRole('region', { name: '完了' }))
      expect(done.queryByRole('button', { name: addLabel })).not.toBeInTheDocument()
    })

    it('追加すると、そのリストの最後にカードが増え、件数も増える。続けて追加できる', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(makeBoard()))
        .mockResolvedValueOnce(jsonResponse(makeCard({ id: 10, title: '請求書を送る' }), 201))
        .mockResolvedValueOnce(jsonResponse(makeCard({ id: 11, title: '見積書を確認する' }), 201))
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()

      render(<BoardPage />)
      const todo = within(await screen.findByRole('region', { name: '未着手' }))
      expect(todo.getByLabelText('2件')).toBeInTheDocument()

      await user.click(todo.getByRole('button', { name: addLabel }))
      await user.type(todo.getByLabelText('カードのタイトル'), '請求書を送る')
      await user.click(todo.getByRole('button', { name: '追加' }))

      expect(await todo.findByRole('heading', { name: '請求書を送る' })).toBeInTheDocument()
      expect(todo.getByLabelText('3件')).toBeInTheDocument()

      // 入力欄は開いたまま、空になっていて、続けて追加できる
      const input = todo.getByLabelText('カードのタイトル')
      expect(input).toHaveValue('')
      await user.type(input, '見積書を確認する{Enter}')

      expect(await todo.findByRole('heading', { name: '見積書を確認する' })).toBeInTheDocument()
      expect(todo.getByLabelText('4件')).toBeInTheDocument()
      // 最後に足したカードが、いちばん下にある
      const titles = todo.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
      expect(titles.slice(-2)).toEqual(['請求書を送る', '見積書を確認する'])

      // 送った内容(どのリストに、何というタイトルで)
      expect(fetchMock.mock.calls[1][0]).toBe('/api/cards')
      expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ listId: 1, title: '請求書を送る' })
      // 他のリストは変わらない
      expect(within(screen.getByRole('region', { name: '進行中' })).getByLabelText('1件')).toBeInTheDocument()
    })

    it('追加に失敗したら、理由を出し、カードは増えず、入力した文字は残る', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(jsonResponse(makeBoard()))
          .mockResolvedValueOnce(jsonResponse({ message: 'リストが見つかりません(id=1)' }, 404)),
      )
      const user = userEvent.setup()

      render(<BoardPage />)
      const todo = within(await screen.findByRole('region', { name: '未着手' }))
      await user.click(todo.getByRole('button', { name: addLabel }))
      await user.type(todo.getByLabelText('カードのタイトル'), '請求書を送る')
      await user.click(todo.getByRole('button', { name: '追加' }))

      expect(await todo.findByRole('alert')).toHaveTextContent('保存できませんでした。リストが見つかりません(id=1)')
      expect(todo.getByLabelText('カードのタイトル')).toHaveValue('請求書を送る')
      expect(todo.getByLabelText('2件')).toBeInTheDocument()
      expect(todo.queryByRole('heading', { name: '請求書を送る' })).not.toBeInTheDocument()
    })
  })
})

describe('BoardPage: カードを押すと、編集ダイアログが開く', () => {
  const estimate = { id: 1, title: '見積書を作る' }

  it('カードを押すと、そのカードのダイアログが開く。「キャンセル」で閉じる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(makeBoard())))
    const user = userEvent.setup()
    render(<BoardPage />)

    await user.click(await screen.findByRole('heading', { name: estimate.title }))

    const dialog = screen.getByRole('dialog', { name: 'カードを編集' })
    expect(dialog).toHaveTextContent(estimate.title)
    await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Enter キーでも開く', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(makeBoard())))
    const user = userEvent.setup()
    render(<BoardPage />)
    const card = (await screen.findByRole('heading', { name: estimate.title })).closest('li')!

    card.focus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('dialog', { name: 'カードを編集' })).toBeInTheDocument()
  })

  it('期限を変えて「決定」すると、ダイアログが閉じ、カードの表示が、すぐ変わる', async () => {
    const saved = makeCard({
      id: 1,
      title: '見積書を作る',
      dueAt: '2026-12-24T09:30:00+09:00',
      dueStatus: 'NORMAL',
      dueIcon: '🕒',
      dueLabel: '通常',
    })
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(makeBoard())).mockResolvedValueOnce(jsonResponse(saved))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<BoardPage />)
    expect(await screen.findByText(/11\/2 超過/)).toBeInTheDocument() // 変える前は、超過

    await user.click(screen.getByRole('heading', { name: estimate.title }))
    fireEvent.change(screen.getByLabelText('日付と時刻'), { target: { value: '2026-12-24T09:30' } })
    await user.click(screen.getByRole('button', { name: '決定' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText(/11\/2 超過/)).not.toBeInTheDocument()
    expect(screen.getByText(/12\/24/)).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/cards/1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ dueAt: '2026-12-24T09:30:00+09:00' })
  })

  it('保存に失敗したら、ダイアログは開いたまま、理由が出て、カードの表示は変わらない', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
      .mockResolvedValueOnce(jsonResponse({ message: 'サーバーの調子が悪いようです' }, 500))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<BoardPage />)
    await screen.findByText(/11\/2 超過/)

    await user.click(screen.getByRole('heading', { name: estimate.title }))
    fireEvent.change(screen.getByLabelText('日付と時刻'), { target: { value: '2026-12-24T09:30' } })
    await user.click(screen.getByRole('button', { name: '決定' }))

    expect(await screen.findByText('保存できませんでした。サーバーの調子が悪いようです')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/11\/2 超過/)).toBeInTheDocument()
  })

  it('削除は、確認してから。「削除する」で、画面からカードが消え、件数が減り、知らせが出る', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(makeBoard())).mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<BoardPage />)
    const todo = within(await screen.findByRole('region', { name: '未着手' }))
    expect(todo.getByLabelText('2件')).toBeInTheDocument()

    await user.click(todo.getByRole('heading', { name: estimate.title }))
    await user.click(screen.getByRole('button', { name: 'このカードを削除' }))
    expect(fetchMock).toHaveBeenCalledTimes(1) // 確認の画面では、まだ消していない
    await user.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(todo.queryByRole('heading', { name: estimate.title })).not.toBeInTheDocument()
    expect(todo.getByLabelText('1件')).toBeInTheDocument()
    expect(screen.getByText('「見積書を作る」を削除しました')).toBeInTheDocument() // 画面の下の知らせ
    expect(fetchMock.mock.calls[1][0]).toBe('/api/cards/1')
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE')
  })

  it('削除に失敗したら、カードは消えず、確認の画面に理由が出る', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
      .mockResolvedValueOnce(jsonResponse({ message: 'サーバーの調子が悪いようです' }, 500))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<BoardPage />)

    await user.click(await screen.findByRole('heading', { name: estimate.title }))
    await user.click(screen.getByRole('button', { name: 'このカードを削除' }))
    await user.click(screen.getByRole('button', { name: '削除する' }))

    expect(await screen.findByText('削除できませんでした。サーバーの調子が悪いようです')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '未着手' })).getByRole('heading', { name: estimate.title })).toBeInTheDocument()
  })
})

describe('BoardPage: 完了マーク(○/✔)', () => {
  // makeBoard(): 未着手(カード 1 見積書を作る(チェック 3/5)、2 資料をまとめる)/ 進行中(3 部長に報告)/ 完了(5 契約書の確認)
  const doneAt = '2026-11-06T10:00:00+09:00'
  const reportDone = makeCard({ id: 3, title: '部長に報告', completedAt: doneAt, dueStatus: 'COMPLETED', dueIcon: '✔', dueLabel: '完了' })

  /** 通信の差し替え。ボードの中身(board)を、完了・未完了のたびに、サーバーの結果のように書き換える。 */
  function server() {
    let board = makeBoard()
    const handler = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/board') return Promise.resolve(jsonResponse(board))
      const body = init?.body ? JSON.parse(init.body as string) : {}
      if (url === '/api/cards/3/complete' && body.completed === true) {
        board = replaceCard(moveCardInBoard(board, 3, 3, 0), reportDone) // 「完了」のいちばん上へ
        return Promise.resolve(jsonResponse(reportDone))
      }
      if (url === '/api/cards/3/complete' && body.completed === false) {
        board = moveCardInBoard(replaceCard(board, makeCard({ id: 3, title: '部長に報告' })), 3, 2, 0)
        return Promise.resolve(jsonResponse(makeCard({ id: 3, title: '部長に報告' })))
      }
      if (url === '/api/cards/5/complete') {
        board = replaceCard(board, makeCard({ id: 5, title: '契約書の確認' }))
        return Promise.resolve(jsonResponse(makeCard({ id: 5, title: '契約書の確認' })))
      }
      if (url === '/api/cards/1/complete') {
        board = replaceCard(moveCardInBoard(board, 1, 3, 0), makeCard({ id: 1, title: '見積書を作る', completedAt: doneAt }))
        return Promise.resolve(jsonResponse(makeCard({ id: 1, title: '見積書を作る', completedAt: doneAt })))
      }
      return Promise.reject(new Error(`想定していない通信: ${url}`))
    })
    vi.stubGlobal('fetch', handler)
    return handler
  }
  const patches = (handler: ReturnType<typeof server>) =>
    handler.mock.calls.filter(([url]) => String(url).endsWith('/complete')).map(([url, init]) => [url, JSON.parse(init!.body as string)])

  it('○ を押すと、完了にして、カードが「完了」のいちばん上へ移る。編集ダイアログは開かない', async () => {
    const handler = server()
    const user = userEvent.setup()
    render(<BoardPage />)

    await user.click(await screen.findByRole('button', { name: '完了にする: 部長に報告' }))

    const done = within(await screen.findByRole('region', { name: '完了' }))
    expect(await done.findByRole('button', { name: '未完了に戻す: 部長に報告' })).toBeInTheDocument()
    expect(done.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['部長に報告', '契約書の確認'])
    expect(patches(handler)).toEqual([['/api/cards/3/complete', { completed: true }]])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('完了にしたら、「完了にしました [元に戻す]」の知らせが出る。「元に戻す」で、もとの位置(1 から数えて 1 番目)へ戻る', async () => {
    const handler = server()
    const user = userEvent.setup()
    render(<BoardPage />)
    await user.click(await screen.findByRole('button', { name: '完了にする: 部長に報告' }))

    expect(await screen.findByText('「部長に報告」を完了にしました')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '元に戻す' }))

    const doing = within(await screen.findByRole('region', { name: '進行中' }))
    expect(await doing.findByRole('heading', { name: '部長に報告' })).toBeInTheDocument()
    expect(screen.queryByText('「部長に報告」を完了にしました')).not.toBeInTheDocument()
    expect(patches(handler)).toEqual([
      ['/api/cards/3/complete', { completed: true }],
      ['/api/cards/3/complete', { completed: false, position: 1 }], // もとは、進行中の 0 番目 = 1 番目
    ])
  })

  it('✔ を押すと、未完了に戻す(位置は指定しない)。知らせに「元に戻す」は出ない', async () => {
    const handler = server()
    const user = userEvent.setup()
    render(<BoardPage />)

    await user.click(await screen.findByRole('button', { name: '未完了に戻す: 契約書の確認' }))

    expect(await screen.findByText('「契約書の確認」を未完了に戻しました')).toBeInTheDocument()
    expect(patches(handler)).toEqual([['/api/cards/5/complete', { completed: false }]])
    expect(screen.queryByRole('button', { name: '元に戻す' })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '完了にする: 契約書の確認' })).toBeInTheDocument()
  })

  it('チェック項目が残っているカードは、先に確認する。「やめる」では、何も送らない', async () => {
    const handler = server()
    const user = userEvent.setup()
    render(<BoardPage />)

    await user.click(await screen.findByRole('button', { name: '完了にする: 見積書を作る' }))

    const dialog = screen.getByRole('dialog', { name: 'チェックリストが残っています' })
    expect(dialog).toHaveTextContent('「見積書を作る」には、まだ終わっていない手順が 2 件あります。完了にしますか')
    await user.click(within(dialog).getByRole('button', { name: 'やめる' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(patches(handler)).toEqual([])
  })

  it('確認で「完了にする」を押すと、完了にする', async () => {
    const handler = server()
    const user = userEvent.setup()
    render(<BoardPage />)
    await user.click(await screen.findByRole('button', { name: '完了にする: 見積書を作る' }))

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '完了にする' }))

    expect(await screen.findByText('「見積書を作る」を完了にしました')).toBeInTheDocument()
    expect(patches(handler)).toEqual([['/api/cards/1/complete', { completed: true }]])
    const done = within(screen.getByRole('region', { name: '完了' }))
    await vi.waitFor(() => expect(done.getByRole('heading', { name: '見積書を作る' })).toBeInTheDocument())
  })

  it('保存に失敗したら、理由を出し、カードは動かない', async () => {
    const handler = vi.fn((url: string) =>
      Promise.resolve(
        url === '/api/board' ? jsonResponse(makeBoard()) : jsonResponse({ message: 'サーバーの調子が悪いようです' }, 500),
      ),
    )
    vi.stubGlobal('fetch', handler)
    const user = userEvent.setup()
    render(<BoardPage />)

    await user.click(await screen.findByRole('button', { name: '完了にする: 部長に報告' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('保存できませんでした。サーバーの調子が悪いようです')
    const doing = within(screen.getByRole('region', { name: '進行中' }))
    expect(doing.getByRole('heading', { name: '部長に報告' })).toBeInTheDocument()
    expect(screen.queryByText('「部長に報告」を完了にしました')).not.toBeInTheDocument()
  })
})

describe('BoardPage: チェックリストの○を押すと☑になる', () => {
  const items = [
    { id: 11, text: '取引先の情報を集める', done: true },
    { id: 12, text: '上司に確認する', done: false },
  ]
  const boardWithChecklist = (): BoardView => {
    const board = makeBoard()
    board.lists[0].cards[0] = makeCard({ id: 1, title: '見積書を作る', checklistDone: 1, checklistTotal: 2, checklist: items })
    return board
  }

  it('○を押すと、☑になり、ダイアログの「1/2」も、カード一覧の進み具合も、すぐ変わる', async () => {
    const saved = makeCard({
      id: 1,
      title: '見積書を作る',
      checklistDone: 2,
      checklistTotal: 2,
      checklist: items.map((item) => ({ ...item, done: true })),
    })
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(boardWithChecklist())).mockResolvedValueOnce(jsonResponse(saved))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<BoardPage />)

    await user.click(await screen.findByRole('heading', { name: '見積書を作る' }))
    const dialog = screen.getByRole('dialog', { name: 'カードを編集' })
    expect(dialog).toHaveTextContent('1/2 完了')
    await user.click(within(dialog).getByRole('button', { name: '上司に確認する' }))

    await waitFor(() => expect(within(dialog).getByRole('button', { name: '上司に確認する' })).toHaveAttribute('aria-pressed', 'true'))
    expect(dialog).toHaveTextContent('2/2 完了')
    expect(within(dialog).getByRole('button', { name: '上司に確認する' })).toHaveTextContent('☑')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/checklist-items/12')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ done: true }) })
    expect(screen.getByRole('dialog', { name: 'カードを編集' })).toBeInTheDocument() // 閉じない
  })

  it('保存に失敗したら、理由を出し、○のまま', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(boardWithChecklist()))
      .mockResolvedValueOnce(jsonResponse({ message: 'サーバーで問題が起きました' }, 500))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<BoardPage />)

    await user.click(await screen.findByRole('heading', { name: '見積書を作る' }))
    const dialog = screen.getByRole('dialog', { name: 'カードを編集' })
    await user.click(within(dialog).getByRole('button', { name: '上司に確認する' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('チェックリストを更新できませんでした。サーバーで問題が起きました')
    expect(within(dialog).getByRole('button', { name: '上司に確認する' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('項目が無いカードを押しても、チェックリストの欄が出る', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(makeBoard())))
    const user = userEvent.setup()
    render(<BoardPage />)

    await user.click(await screen.findByRole('heading', { name: '資料をまとめる' }))

    expect(screen.getByRole('region', { name: 'チェックリスト' })).toHaveTextContent('チェックリストは、まだありません')
  })
})

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BoardView } from '../api/types'
import { findCard } from '../lib/boardMove'
import { jsonResponse, makeBoard, makeCard } from '../test/fixtures'
import { useBoard } from './useBoard'

// makeBoard(): 未着手(id 1: カード 1, 2)/ 進行中(id 2: カード 3)/ 完了(id 3: カード 5)
async function loaded(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const hook = renderHook(() => useBoard())
  await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
  return hook
}

const boardOf = (hook: { result: { current: ReturnType<typeof useBoard> } }): BoardView => {
  const state = hook.result.current.state
  if (state.status !== 'ready') throw new Error('ボードを読み込めていません')
  return state.board
}

describe('useBoard の moveCard', () => {
  it('通信を待たずに、先に画面へ反映し、成功したら、返ってきたカード(完了日時つき)で置き換える', async () => {
    let finish: (response: Response) => void = () => {}
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
      .mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)))
    const hook = await loaded(fetchMock)

    let result: Promise<string | null> = Promise.resolve(null)
    act(() => {
      result = hook.result.current.moveCard(2, { listId: 1, index: 1 }, { listId: 3, index: 0 })
    })

    // まだ、保存の返事は来ていないが、画面ではもう動いている
    expect(findCard(boardOf(hook), 2)).toEqual({ listId: 3, index: 0 })
    expect(boardOf(hook).lists.map((l) => l.cardCount)).toEqual([1, 1, 2])
    expect(boardOf(hook).lists[2].cards[0].completedAt).toBeNull()

    await act(async () => {
      finish(jsonResponse(makeCard({ id: 2, title: '資料をまとめる', completedAt: '2026-11-05T10:00:00+09:00', dueStatus: 'COMPLETED' })))
      await result
    })

    expect(await result).toBeNull()
    expect(boardOf(hook).lists[2].cards[0].completedAt).toBe('2026-11-05T10:00:00+09:00')
    // 送った内容: 移し先のリストの id と、1 から数えた位置
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/cards/2/move')
    expect(JSON.parse(init.body)).toEqual({ listId: 3, position: 1 })
  })

  it('保存に失敗したら、元の場所へ戻し、理由を返す', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
      .mockResolvedValueOnce(jsonResponse({ message: 'リストが見つかりません(id=3)' }, 404))
    const hook = await loaded(fetchMock)
    const before = boardOf(hook)

    let error: string | null = null
    await act(async () => {
      error = await hook.result.current.moveCard(2, { listId: 1, index: 1 }, { listId: 3, index: 0 })
    })

    expect(error).toBe('リストが見つかりません(id=3)')
    expect(boardOf(hook)).toEqual(before) // カードも件数も、元どおり
  })

  it('通信できなかったときも、元の場所へ戻す', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(makeBoard())).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const hook = await loaded(fetchMock)
    const before = boardOf(hook)

    let error: string | null = null
    await act(async () => {
      error = await hook.result.current.moveCard(1, { listId: 1, index: 0 }, { listId: 2, index: 1 })
    })

    expect(error).toBe('通信できませんでした')
    expect(boardOf(hook)).toEqual(before)
  })

  it('失敗して戻すときも、通信中に追加した、ほかのカードは消えない', async () => {
    let fail: (response: Response) => void = () => {}
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
      .mockReturnValueOnce(new Promise<Response>((resolve) => (fail = resolve)))
    const hook = await loaded(fetchMock)

    let result: Promise<string | null> = Promise.resolve(null)
    act(() => {
      result = hook.result.current.moveCard(1, { listId: 1, index: 0 }, { listId: 2, index: 0 })
    })
    act(() => hook.result.current.addCard(1, makeCard({ id: 50, title: '通信中に追加' })))
    await act(async () => {
      fail(jsonResponse({ message: 'だめでした' }, 400))
      await result
    })

    const board = boardOf(hook)
    expect(findCard(board, 1)).toEqual({ listId: 1, index: 0 }) // 元の先頭へ戻った
    expect(findCard(board, 50)).not.toBeNull() // 追加したカードも残っている
  })
})

describe('useBoard の updateCard', () => {
  it('保存できたら、返ってきたカード(期限の状態が新しい)で置き換える', async () => {
    const saved = makeCard({ id: 1, title: '見積書を作る', dueAt: '2026-12-01T18:00:00+09:00', dueStatus: 'NORMAL', dueIcon: '🕒', dueLabel: '通常' })
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(makeBoard())).mockResolvedValueOnce(jsonResponse(saved))
    const hook = await loaded(fetchMock)

    let result: string | null = 'まだ'
    await act(async () => {
      result = await hook.result.current.updateCard(1, { dueAt: '2026-12-01T18:00:00+09:00' })
    })

    expect(result).toBeNull()
    expect(boardOf(hook).lists[0].cards[0].dueStatus).toBe('NORMAL')
    expect(findCard(boardOf(hook), 1)).toEqual({ listId: 1, index: 0 }) // 場所は変わらない
    expect(fetchMock.mock.calls[1][0]).toBe('/api/cards/1')
  })

  it('失敗したら、理由を返し、ボードは変えない', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
      .mockResolvedValueOnce(jsonResponse({ message: '期限の日時の形が正しくありません' }, 400))
    const hook = await loaded(fetchMock)
    const before = boardOf(hook)

    let result: string | null = null
    await act(async () => {
      result = await hook.result.current.updateCard(1, { dueAt: 'あした' })
    })

    expect(result).toBe('期限の日時の形が正しくありません')
    expect(boardOf(hook)).toBe(before)
  })
})

describe('useBoard の deleteCard', () => {
  it('消せたら、画面からカードを取り除き、件数も減らす', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(makeBoard())).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const hook = await loaded(fetchMock)

    let result: string | null = 'まだ'
    await act(async () => {
      result = await hook.result.current.deleteCard(1)
    })

    expect(result).toBeNull()
    expect(findCard(boardOf(hook), 1)).toBeNull()
    expect(boardOf(hook).lists.map((l) => l.cardCount)).toEqual([1, 1, 1])
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE')
  })

  it('消せなかったら、理由を返し、カードは画面に残す(先に消さない)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
      .mockResolvedValueOnce(jsonResponse({ message: 'サーバーの調子が悪いようです' }, 500))
    const hook = await loaded(fetchMock)

    let result: string | null = null
    await act(async () => {
      result = await hook.result.current.deleteCard(1)
    })

    expect(result).toBe('サーバーの調子が悪いようです')
    expect(findCard(boardOf(hook), 1)).not.toBeNull()
  })

  it('すでに無かった(404)ときは、もう消えているので、成功と同じに扱い、画面からも取り除く', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
      .mockResolvedValueOnce(jsonResponse({ message: 'カードが見つかりません(id=1)' }, 404))
    const hook = await loaded(fetchMock)

    let result: string | null = 'まだ'
    await act(async () => {
      result = await hook.result.current.deleteCard(1)
    })

    expect(result).toBeNull()
    expect(findCard(boardOf(hook), 1)).toBeNull()
  })
})

describe('useBoard の refresh と setCardCompleted', () => {
  // makeBoard(): 未着手(id 1: カード 1, 2)/ 進行中(id 2: カード 3)/ 完了(id 3: カード 5)
  const movedToDone = (): BoardView => {
    const board = makeBoard()
    return {
      ...board,
      lists: [
        { ...board.lists[0] },
        { ...board.lists[1], cards: [], cardCount: 0 },
        { ...board.lists[2], cards: [makeCard({ id: 3, title: '部長に報告', completedAt: '2026-11-06T10:00:00+09:00' }), ...board.lists[2].cards], cardCount: 2 },
      ],
    }
  }

  it('完了にできたら、ボードを取り直して、サーバーの置き場所にそろえる。灰色の枠(読み込み中)は出さない', async () => {
    let finishRefresh: (response: Response) => void = () => {}
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
      .mockResolvedValueOnce(jsonResponse(makeCard({ id: 3, completedAt: '2026-11-06T10:00:00+09:00' })))
      .mockReturnValueOnce(new Promise<Response>((resolve) => (finishRefresh = resolve)))
    const hook = await loaded(fetchMock)

    let result: Promise<string | null> = Promise.resolve('まだ')
    act(() => {
      result = hook.result.current.setCardCompleted(3, true)
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3)) // 取り直しの通信が始まった
    expect(hook.result.current.state.status).toBe('ready') // 取り直している間も、画面は、そのまま

    await act(async () => {
      finishRefresh(jsonResponse(movedToDone()))
      await result
    })

    expect(await result).toBeNull()
    expect(findCard(boardOf(hook), 3)).toEqual({ listId: 3, index: 0 }) // 「完了」のいちばん上
    expect(fetchMock.mock.calls[1][0]).toBe('/api/cards/3/complete')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ completed: true })
  })

  it('未完了に戻すとき、位置(1 から)も送れる', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
      .mockResolvedValueOnce(jsonResponse(makeCard({ id: 5 })))
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
    const hook = await loaded(fetchMock)

    await act(async () => {
      await hook.result.current.setCardCompleted(5, false, 2)
    })

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ completed: false, position: 2 })
  })

  it('保存に失敗したら、理由を返し、ボードを取り直さず、変えない', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
      .mockResolvedValueOnce(jsonResponse({ message: 'カードが見つかりません(id=3)' }, 404))
    const hook = await loaded(fetchMock)
    const before = boardOf(hook)

    let result: string | null = null
    await act(async () => {
      result = await hook.result.current.setCardCompleted(3, true)
    })

    expect(result).toBe('カードが見つかりません(id=3)')
    expect(fetchMock).toHaveBeenCalledTimes(2) // 取り直しの通信は、していない
    expect(boardOf(hook)).toBe(before)
  })

  it('refresh: 取り直せなかったときは、いまの画面を残す', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(makeBoard())).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const hook = await loaded(fetchMock)
    const before = boardOf(hook)

    await act(async () => {
      await hook.result.current.refresh()
    })

    expect(hook.result.current.state.status).toBe('ready')
    expect(boardOf(hook)).toBe(before)
  })
})

describe('useBoard の setChecklistItemDone', () => {
  it('成功したら、返ってきたカードで置き換える(進み具合も変わる)。場所は変わらない', async () => {
    const saved = makeCard({
      id: 1,
      title: '見積書を作る',
      checklistDone: 4,
      checklistTotal: 5,
      checklist: [{ id: 13, text: '上司に確認する', done: true }],
    })
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(makeBoard())).mockResolvedValueOnce(jsonResponse(saved))
    const hook = await loaded(fetchMock)

    let result: string | null = 'まだ'
    await act(async () => {
      result = await hook.result.current.setChecklistItemDone(13, true)
    })

    expect(result).toBeNull()
    expect(boardOf(hook).lists[0].cards[0].checklistDone).toBe(4)
    expect(findCard(boardOf(hook), 1)).toEqual({ listId: 1, index: 0 })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/checklist-items/13')
  })

  it('失敗したら、理由を返し、ボードは変えない', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeBoard()))
      .mockResolvedValueOnce(jsonResponse({ message: 'チェックリストの項目が見つかりません(id=13)' }, 404))
    const hook = await loaded(fetchMock)
    const before = boardOf(hook)

    let result: string | null = null
    await act(async () => {
      result = await hook.result.current.setChecklistItemDone(13, true)
    })

    expect(result).toBe('チェックリストの項目が見つかりません(id=13)')
    expect(boardOf(hook)).toBe(before)
  })
})

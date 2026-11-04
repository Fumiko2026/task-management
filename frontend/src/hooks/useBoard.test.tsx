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

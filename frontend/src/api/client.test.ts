import { describe, expect, it, vi } from 'vitest'
import { jsonResponse, makeCard } from '../test/fixtures'
import { ApiError, completeCard, createCard, deleteCard, moveCard, updateCard } from './client'

describe('createCard', () => {
  it('/api/cards に、JSON を POST して、作ったカードを返す', async () => {
    const created = makeCard({ id: 10, title: '請求書を送る' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(created, 201))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createCard(3, '請求書を送る')

    expect(result).toEqual(created)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cards',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ listId: 3, title: '請求書を送る' }),
      }),
    )
  })

  it('400 のときは、API の理由を持つ ApiError にする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'タイトルを入力してください' }, 400)))

    const error = await createCard(3, ' ').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, message: 'タイトルを入力してください' })
  })

  it('JSON ではないエラーのときは、番号だけの文にする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })))

    await expect(createCard(3, '請求書')).rejects.toMatchObject({ status: 502, message: 'エラーが起きました(502)' })
  })

  it('通信できないときは、「通信できませんでした」', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(createCard(3, '請求書')).rejects.toMatchObject({ status: 0, message: '通信できませんでした' })
  })
})

describe('moveCard', () => {
  it('/api/cards/{id}/move に、PATCH で、リストの id と位置(1 から)を送り、動かしたカードを返す', async () => {
    const moved = makeCard({ id: 7, title: '請求書を送る', completedAt: '2026-11-05T10:00:00+09:00' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(moved))
    vi.stubGlobal('fetch', fetchMock)

    const result = await moveCard(7, 3, 2)

    expect(result).toEqual(moved)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cards/7/move',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ listId: 3, position: 2 }) }),
    )
  })

  it('404 / 400 のときは、API の理由を持つ ApiError にする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'リストが見つかりません(id=9)' }, 404)))

    await expect(moveCard(7, 9, 1)).rejects.toMatchObject({ status: 404, message: 'リストが見つかりません(id=9)' })
  })

  it('通信できないときは、「通信できませんでした」', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(moveCard(7, 3, 1)).rejects.toMatchObject({ status: 0, message: '通信できませんでした' })
  })
})

describe('updateCard', () => {
  it('/api/cards/{id} に、PATCH で、期限を送り、更新後のカードを返す', async () => {
    const updated = makeCard({ id: 7, dueAt: '2026-11-11T18:00:00+09:00', dueStatus: 'DUE_SOON' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(updated))
    vi.stubGlobal('fetch', fetchMock)

    const result = await updateCard(7, { dueAt: '2026-11-11T18:00:00+09:00' })

    expect(result).toEqual(updated)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cards/7',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ dueAt: '2026-11-11T18:00:00+09:00' }) }),
    )
  })

  it('期限を消すときは、null を送る', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeCard({ id: 7 })))
    vi.stubGlobal('fetch', fetchMock)

    await updateCard(7, { dueAt: null })

    expect(fetchMock.mock.calls[0][1].body).toBe('{"dueAt":null}')
  })

  it('400 / 404 のときは、API の理由を持つ ApiError にする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: '期限の日付が範囲外です(2000〜2100年)' }, 400)))

    await expect(updateCard(7, { dueAt: '1999-01-01T00:00:00+09:00' })).rejects.toMatchObject({
      status: 400,
      message: '期限の日付が範囲外です(2000〜2100年)',
    })
  })

  it('通信できないときは、「通信できませんでした」', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(updateCard(7, { dueAt: null })).rejects.toMatchObject({ status: 0, message: '通信できませんでした' })
  })
})

describe('deleteCard', () => {
  it('/api/cards/{id} に、DELETE を送る。204(中身なし)で成功', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteCard(7)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledWith('/api/cards/7', expect.objectContaining({ method: 'DELETE' }))
  })

  it('404 のときは、API の理由を持つ ApiError にする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'カードが見つかりません(id=7)' }, 404)))

    await expect(deleteCard(7)).rejects.toMatchObject({ status: 404, message: 'カードが見つかりません(id=7)' })
  })

  it('通信できないときは、「通信できませんでした」', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(deleteCard(7)).rejects.toMatchObject({ status: 0, message: '通信できませんでした' })
  })
})

describe('completeCard', () => {
  it('/api/cards/{id}/complete に、PATCH で、completed を送り、更新後のカードを返す', async () => {
    const done = makeCard({ id: 7, title: '請求書を送る', completedAt: '2026-11-06T10:00:00+09:00', dueStatus: 'COMPLETED' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(done))
    vi.stubGlobal('fetch', fetchMock)

    const result = await completeCard(7, true)

    expect(result).toEqual(done)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cards/7/complete',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ completed: true }) }),
    )
  })

  it('位置(1 から)を渡したときだけ、position も送る', async () => {
    // 呼ばれるたびに、新しいレスポンスを返す(同じレスポンスは、2 回は読めない)
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(jsonResponse(makeCard({ id: 7 }))))
    vi.stubGlobal('fetch', fetchMock)

    await completeCard(7, false, 2)
    await completeCard(7, false)

    expect(fetchMock.mock.calls[0][1].body).toBe('{"completed":false,"position":2}')
    expect(fetchMock.mock.calls[1][1].body).toBe('{"completed":false}')
  })

  it('404 / 400 のときは、API の理由を持つ ApiError にする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'カードが見つかりません(id=7)' }, 404)))

    await expect(completeCard(7, true)).rejects.toMatchObject({ status: 404, message: 'カードが見つかりません(id=7)' })
  })

  it('通信できないときは、「通信できませんでした」', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(completeCard(7, true)).rejects.toMatchObject({ status: 0, message: '通信できませんでした' })
  })
})

import { describe, expect, it, vi } from 'vitest'
import { jsonResponse, makeCard } from '../test/fixtures'
import { ApiError, createCard, moveCard } from './client'

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

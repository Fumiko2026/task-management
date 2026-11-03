import { describe, expect, it, vi } from 'vitest'
import { jsonResponse, makeCard } from '../test/fixtures'
import { ApiError, createCard } from './client'

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

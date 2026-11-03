import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { jsonResponse, makeCard } from '../test/fixtures'
import { AddCardForm } from './AddCardForm'

const addButton = () => screen.getByRole('button', { name: '＋ カードを追加' })
const input = () => screen.getByLabelText('カードのタイトル')
const submitButton = () => screen.getByRole('button', { name: '追加' })

/** 開いた状態にして返す。 */
async function openForm(onAdded = vi.fn()) {
  const user = userEvent.setup()
  render(<AddCardForm listId={7} onAdded={onAdded} />)
  await user.click(addButton())
  return { user, onAdded }
}

describe('AddCardForm', () => {
  it('最初は、「＋ カードを追加」のボタンだけを出す', () => {
    render(<AddCardForm listId={7} onAdded={vi.fn()} />)

    expect(addButton()).toBeInTheDocument()
    expect(screen.queryByLabelText('カードのタイトル')).not.toBeInTheDocument()
  })

  it('ボタンを押すと、その場に入力欄と「追加」「キャンセル」が出て、入力欄に文字を入れられる', async () => {
    await openForm()

    expect(input()).toHaveFocus()
    expect(submitButton()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument()
    expect(input()).toHaveAttribute('maxlength', '100')
  })

  it('タイトルが空、または空白だけのときは、「追加」を押せない', async () => {
    const { user } = await openForm()

    expect(submitButton()).toBeDisabled()
    await user.type(input(), '   　')
    expect(submitButton()).toBeDisabled()
    await user.type(input(), '請求書')
    expect(submitButton()).toBeEnabled()
  })

  it('追加すると、リストの id とタイトルを POST で送り、作ったカードを渡す', async () => {
    const created = makeCard({ id: 10, title: '請求書を送る' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(created, 201))
    vi.stubGlobal('fetch', fetchMock)
    const { user, onAdded } = await openForm()

    await user.type(input(), '請求書を送る')
    await user.click(submitButton())

    expect(onAdded).toHaveBeenCalledWith(created)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/cards')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ listId: 7, title: '請求書を送る' })
  })

  it('追加したあとも入力欄は開いたまま、空になり、続けて追加できる', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeCard({ id: 10, title: '1つ目' }), 201))
      .mockResolvedValueOnce(jsonResponse(makeCard({ id: 11, title: '2つ目' }), 201))
    vi.stubGlobal('fetch', fetchMock)
    const { user, onAdded } = await openForm()

    await user.type(input(), '1つ目')
    await user.click(submitButton())
    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(input()).toHaveValue('')
    expect(input()).toHaveFocus()
    expect(submitButton()).toBeDisabled()

    await user.type(input(), '2つ目{Enter}')
    expect(onAdded).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status')).toHaveTextContent('「2つ目」を追加しました')
  })

  it('タイトルの前後の空白は、取り除いて送る', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeCard({ id: 10, title: '請求書' }), 201))
    vi.stubGlobal('fetch', fetchMock)
    const { user } = await openForm()

    await user.type(input(), '  請求書  {Enter}')

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ listId: 7, title: '請求書' })
  })

  it('保存に失敗したら、API の理由を出し、入力した文字は残る。直して、もう一度追加できる', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'タイトルは100文字までです' }, 400))
      .mockResolvedValueOnce(jsonResponse(makeCard({ id: 10, title: '請求書' }), 201))
    vi.stubGlobal('fetch', fetchMock)
    const { user, onAdded } = await openForm()

    await user.type(input(), '請求書')
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('保存できませんでした。タイトルは100文字までです')
    expect(input()).toHaveValue('請求書')
    expect(onAdded).not.toHaveBeenCalled()

    await user.click(submitButton())

    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('通信できなかったときも、理由を出し、入力した文字は残る', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { user, onAdded } = await openForm()

    await user.type(input(), '請求書')
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('保存できませんでした。通信できませんでした')
    expect(input()).toHaveValue('請求書')
    expect(onAdded).not.toHaveBeenCalled()
  })

  it('送信中に、もう一度押しても、二重には送らない', async () => {
    let finish: (response: Response) => void = () => {}
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)))
    vi.stubGlobal('fetch', fetchMock)
    const { user, onAdded } = await openForm()

    await user.type(input(), '請求書')
    await user.click(submitButton())
    // 送信中は、「追加」を押せない。Enter を押しても、送らない
    expect(submitButton()).toBeDisabled()
    await user.type(input(), '{Enter}')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    finish(jsonResponse(makeCard({ id: 10, title: '請求書' }), 201))
    await screen.findByText('「請求書」を追加しました')
    expect(onAdded).toHaveBeenCalledTimes(1)
  })

  it('キャンセルで閉じ、書きかけの文字も消える', async () => {
    const { user } = await openForm()
    await user.type(input(), '書きかけ')

    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByLabelText('カードのタイトル')).not.toBeInTheDocument()
    await user.click(addButton())
    expect(input()).toHaveValue('')
  })

  it('Esc キーでも閉じる', async () => {
    const { user } = await openForm()
    await user.type(input(), '書きかけ')

    await user.keyboard('{Escape}')

    expect(screen.queryByLabelText('カードのタイトル')).not.toBeInTheDocument()
    expect(addButton()).toBeInTheDocument()
  })

  it('リストが長くても、開いたとき・追加したとき・失敗したときに、フォームが見える位置まで画面をずらす', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(makeCard({ id: 10, title: '1つ目' }), 201))
        .mockResolvedValueOnce(jsonResponse({ message: 'タイトルは100文字までです' }, 400))
      vi.stubGlobal('fetch', fetchMock)
      const { user } = await openForm()
      expect(scrollIntoView).toHaveBeenCalledTimes(1) // 開いたとき

      await user.type(input(), '1つ目{Enter}')
      await screen.findByText('「1つ目」を追加しました')
      expect(scrollIntoView).toHaveBeenCalledTimes(2) // 追加したとき

      await user.type(input(), '2つ目{Enter}')
      await screen.findByRole('alert')
      expect(scrollIntoView).toHaveBeenCalledTimes(3) // 失敗の理由が出たとき
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })
    } finally {
      // @ts-expect-error テストのために足した関数を、元の「無い」状態に戻す
      delete Element.prototype.scrollIntoView
    }
  })
})

import { describe, expect, it } from 'vitest'
import type { BoardView } from '../api/types'
import { makeBoard, makeCard, makeList } from '../test/fixtures'
import { countCards, findCard, moveCardInBoard, removeCard, replaceCard } from './boardMove'

// makeBoard(): 未着手(id 1: カード 1, 2)/ 進行中(id 2: カード 3)/ 完了(id 3: カード 5)
const ids = (board: BoardView, listId: number) => board.lists.find((l) => l.id === listId)!.cards.map((c) => c.id)

describe('findCard / countCards', () => {
  it('カードが、どのリストの何番目(0 から)にあるかを返す', () => {
    const board = makeBoard()

    expect(findCard(board, 2)).toEqual({ listId: 1, index: 1 })
    expect(findCard(board, 5)).toEqual({ listId: 3, index: 0 })
    expect(findCard(board, 999)).toBeNull()
  })

  it('リストのカードの数を返す。リストが無ければ 0', () => {
    const board = makeBoard()

    expect(countCards(board, 1)).toBe(2)
    expect(countCards(board, 999)).toBe(0)
  })
})

describe('moveCardInBoard', () => {
  it('同じリストの中で、先頭へ動かす', () => {
    const moved = moveCardInBoard(makeBoard(), 2, 1, 0)

    expect(ids(moved, 1)).toEqual([2, 1])
  })

  it('同じリストの中で、最後へ動かす(動かすカードを除いた並びの中の位置)', () => {
    const moved = moveCardInBoard(makeBoard(), 1, 1, 1)

    expect(ids(moved, 1)).toEqual([2, 1])
  })

  it('別のリストの、間に入れる。件数も、両方のリストで変わる', () => {
    const moved = moveCardInBoard(makeBoard(), 1, 3, 0)

    expect(ids(moved, 1)).toEqual([2])
    expect(ids(moved, 3)).toEqual([1, 5])
    expect(moved.lists.map((l) => l.cardCount)).toEqual([1, 1, 2])
  })

  it('別のリストの、最後に入れる', () => {
    const moved = moveCardInBoard(makeBoard(), 1, 2, 1)

    expect(ids(moved, 2)).toEqual([3, 1])
  })

  it('カードが 0 枚のリストへも動かせる', () => {
    const board = makeBoard()
    board.lists[1] = makeList({ id: 2, name: '進行中', position: 2, cards: [] })

    const moved = moveCardInBoard(board, 1, 2, 0)

    expect(ids(moved, 2)).toEqual([1])
    expect(moved.lists[1].cardCount).toBe(1)
  })

  it('位置が大きすぎれば最後に、小さすぎれば最初に丸める', () => {
    expect(ids(moveCardInBoard(makeBoard(), 1, 2, 99), 2)).toEqual([3, 1])
    expect(ids(moveCardInBoard(makeBoard(), 1, 2, -5), 2)).toEqual([1, 3])
  })

  it('元のボードは変えない(新しいボードを返す)', () => {
    const board = makeBoard()
    const before = JSON.stringify(board)

    moveCardInBoard(board, 1, 3, 0)

    expect(JSON.stringify(board)).toBe(before)
  })

  it('変わらなかったリストは、同じものを使い回す', () => {
    const board = makeBoard()

    const moved = moveCardInBoard(board, 1, 2, 0)

    expect(moved.lists[2]).toBe(board.lists[2]) // 完了は、そのまま
  })

  it('カードやリストが無いときは、何も変えない', () => {
    const board = makeBoard()

    expect(moveCardInBoard(board, 999, 1, 0)).toBe(board)
    expect(moveCardInBoard(board, 1, 999, 0)).toBe(board)
  })
})

describe('replaceCard', () => {
  it('同じ id のカードを、新しいカードで置き換える(場所は変わらない)', () => {
    const board = makeBoard()
    const saved = makeCard({ id: 3, title: '部長に報告', completedAt: '2026-11-05T10:00:00+09:00', dueStatus: 'COMPLETED' })

    const replaced = replaceCard(board, saved)

    expect(findCard(replaced, 3)).toEqual({ listId: 2, index: 0 })
    expect(replaced.lists[1].cards[0].completedAt).toBe('2026-11-05T10:00:00+09:00')
    expect(replaced.lists[0]).toBe(board.lists[0]) // 関係ないリストは、そのまま
  })
})

describe('removeCard', () => {
  it('カードを取り除き、そのリストの件数も減る。ほかのリストは、そのまま', () => {
    const board = makeBoard()

    const removed = removeCard(board, 1)

    expect(ids(removed, 1)).toEqual([2])
    expect(removed.lists[0].cardCount).toBe(1)
    expect(removed.lists[1]).toBe(board.lists[1])
    expect(removed.lists[2]).toBe(board.lists[2])
  })

  it('リストの最後の1枚を取り除くと、そのリストは空になる(リストは残る)', () => {
    const removed = removeCard(makeBoard(), 5)

    expect(ids(removed, 3)).toEqual([])
    expect(removed.lists).toHaveLength(3)
  })

  it('元のボードは変えない。カードが無いときは、元のボードのまま', () => {
    const board = makeBoard()
    const before = JSON.stringify(board)

    expect(removeCard(board, 999)).toBe(board)
    removeCard(board, 1)

    expect(JSON.stringify(board)).toBe(before)
  })
})

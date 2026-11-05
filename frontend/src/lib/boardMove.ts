import type { BoardView, CardView, ListView } from '../api/types'

// ボードの中で、カードを動かす計算。画面にも通信にも頼らない、ただの関数(テストしやすい)。
// 「何番目」は、ここでは 0 から数える(API に送るときは 1 から数えるので、+1 する)。

/** カードが、どのリストの何番目(0 から)にあるか。 */
export interface CardPlace {
  listId: number
  index: number
}

/** カードの場所を探す。無ければ null。 */
export function findCard(board: BoardView, cardId: number): CardPlace | null {
  for (const list of board.lists) {
    const index = list.cards.findIndex((card) => card.id === cardId)
    if (index >= 0) return { listId: list.id, index }
  }
  return null
}

/** リストの中のカードの数。リストが無ければ 0。 */
export function countCards(board: BoardView, listId: number): number {
  return board.lists.find((list) => list.id === listId)?.cards.length ?? 0
}

/**
 * カードを、toListId のリストの toIndex 番目(0 から)に動かした、新しいボードを返す(元のボードは変えない)。
 * toIndex は、「動かすカードを取り除いたあとの並び」の中での位置。大きすぎれば最後、小さすぎれば最初に丸める。
 * カードやリストが無いときは、何も変えずに、元のボードを返す。
 */
export function moveCardInBoard(board: BoardView, cardId: number, toListId: number, toIndex: number): BoardView {
  const from = findCard(board, cardId)
  const toList = board.lists.find((list) => list.id === toListId)
  if (!from || !toList) return board

  const card = board.lists.find((list) => list.id === from.listId)!.cards[from.index]

  const lists = board.lists.map((list): ListView => {
    let cards = list.cards
    if (list.id === from.listId) cards = cards.filter((c) => c.id !== cardId) // 元のリストから取り除く
    if (list.id === toListId) {
      const index = Math.min(Math.max(toIndex, 0), cards.length)
      cards = [...cards.slice(0, index), card, ...cards.slice(index)] // 移し先に差し込む
    }
    return cards === list.cards ? list : { ...list, cards, cardCount: cards.length }
  })
  return { ...board, lists }
}

/** カードを取り除いた、新しいボードを返す(削除のあと)。件数 cardCount も、減らす。無ければ、元のボードのまま。 */
export function removeCard(board: BoardView, cardId: number): BoardView {
  if (!findCard(board, cardId)) return board
  return {
    ...board,
    lists: board.lists.map((list) => {
      if (!list.cards.some((c) => c.id === cardId)) return list
      const cards = list.cards.filter((c) => c.id !== cardId)
      return { ...list, cards, cardCount: cards.length }
    }),
  }
}

/** サーバーから返ってきたカードで、同じ id のカードを置き換える(完了日時や期限の状態が、新しくなる)。 */
export function replaceCard(board: BoardView, card: CardView): BoardView {
  return {
    ...board,
    lists: board.lists.map((list) =>
      list.cards.some((c) => c.id === card.id)
        ? { ...list, cards: list.cards.map((c) => (c.id === card.id ? card : c)) }
        : list,
    ),
  }
}

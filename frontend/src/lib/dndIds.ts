// ドラッグ操作の部品(dnd-kit)に渡す、カードとリストの目印(id)。
// カードの id とリストの id は、数字が重なることがある(どちらも 1 から始まる)ので、
// 「card-3」「list-3」のように、前に種類を付けて、区別する。

export type DndTarget = { kind: 'card' | 'list'; id: number }

export const cardDndId = (cardId: number) => `card-${cardId}`
export const listDndId = (listId: number) => `list-${listId}`

/** 「card-3」「list-3」を、種類と番号に戻す。形が違えば null。 */
export function parseDndId(dndId: string | number): DndTarget | null {
  const match = /^(card|list)-(\d+)$/.exec(String(dndId))
  return match ? { kind: match[1] as 'card' | 'list', id: Number(match[2]) } : null
}

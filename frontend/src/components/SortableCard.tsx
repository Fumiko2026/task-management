import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CardView } from '../api/types'
import { cardDndId } from '../lib/dndIds'
import { CardItem } from './CardItem'

/**
 * ドラッグで動かせるカード。短く押す(クリック・タップ)か、Enter キーで、編集ダイアログを開く(onOpen)。
 *   パソコン: 少しマウスで動かすと、持ち上がる。 スマホ: 約0.5秒の長押しで、持ち上がる。
 *   キーボード: フォーカスして Space で持ち上げ、矢印で動かし、Space で置く(Esc で取り消し)。
 * 持ち上げている間、元の場所には、薄いカードが残る。
 */
export function SortableCard({ card, onOpen }: { card: CardView; onOpen: (cardId: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardDndId(card.id),
    // 既定の role="button" だと、カードの中の見出しなどが、読み上げで失われる。一覧の項目のままにする
    attributes: { role: 'listitem', roleDescription: '動かせるカード' },
  })

  // ドラッグの部品のキー操作(Space で持ち上げ)に、Enter で開く操作を足す
  const { onKeyDown: dragKeyDown, ...otherListeners } = listeners ?? {}

  return (
    <li
      ref={setNodeRef}
      className={`sortable-card${isDragging ? ' sortable-card--dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...otherListeners}
      // 部品は、ドラッグが始まったあとのクリックを止めるので、ドラッグのあとに、うっかり開くことはない
      onClick={() => onOpen(card.id)}
      onKeyDown={(event) => {
        dragKeyDown?.(event)
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          event.preventDefault()
          onOpen(card.id)
        }
      }}
    >
      <CardItem card={card} />
    </li>
  )
}

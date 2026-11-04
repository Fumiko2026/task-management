import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CardView } from '../api/types'
import { cardDndId } from '../lib/dndIds'
import { CardItem } from './CardItem'

/**
 * ドラッグで動かせるカード。
 *   パソコン: 少しマウスで動かすと、持ち上がる。 スマホ: 約0.5秒の長押しで、持ち上がる。
 *   キーボード: フォーカスして Space で持ち上げ、矢印で動かし、Space で置く(Esc で取り消し)。
 * 持ち上げている間、元の場所には、薄いカードが残る。
 */
export function SortableCard({ card }: { card: CardView }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardDndId(card.id),
    // 既定の role="button" だと、カードの中の見出しなどが、読み上げで失われる。一覧の項目のままにする
    attributes: { role: 'listitem', roleDescription: '動かせるカード' },
  })

  return (
    <li
      ref={setNodeRef}
      className={`sortable-card${isDragging ? ' sortable-card--dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <CardItem card={card} />
    </li>
  )
}

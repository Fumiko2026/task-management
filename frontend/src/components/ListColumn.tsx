import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { CardView, ListView } from '../api/types'
import { cardDndId, listDndId } from '../lib/dndIds'
import { AddCardForm } from './AddCardForm'
import { SortableCard } from './SortableCard'

/**
 * リスト1列(例: 未着手)。見出しは、縦にスクロールしても上に残す(画面仕様 §3-③)。
 * 末尾に「＋ カードを追加」を置く。ただし「完了」のリストには置かない
 * (完了のリストにあるカードは、完了日時が記録されたカードのため)。
 * リスト全体が、カードを置ける場所になる(カードが 0 枚のリストにも、置ける)。
 */
export function ListColumn({
  list,
  onCardAdded,
  onOpenCard,
  onToggleComplete,
}: {
  list: ListView
  onCardAdded: (card: CardView) => void
  onOpenCard: (cardId: number) => void
  onToggleComplete: (card: CardView) => void
}) {
  // このリストを、カードを置ける場所にする
  const { setNodeRef } = useDroppable({ id: listDndId(list.id) })

  return (
    <section ref={setNodeRef} className="list" aria-label={list.name}>
      <header className="list-header">
        <h2 className="list-name">{list.name}</h2>
        <span className="list-count" aria-label={`${list.cardCount}件`}>
          {list.cardCount}
        </span>
      </header>

      <SortableContext items={list.cards.map((card) => cardDndId(card.id))} strategy={verticalListSortingStrategy}>
        {list.cards.length === 0 ? (
          <p className="list-empty">カードはありません</p>
        ) : (
          <ul className="list-cards">
            {list.cards.map((card) => (
              <SortableCard key={card.id} card={card} onOpen={onOpenCard} onToggleComplete={onToggleComplete} />
            ))}
          </ul>
        )}
      </SortableContext>

      {!list.doneList && <AddCardForm listId={list.id} onAdded={onCardAdded} />}
    </section>
  )
}

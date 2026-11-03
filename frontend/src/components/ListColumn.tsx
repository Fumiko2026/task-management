import type { CardView, ListView } from '../api/types'
import { AddCardForm } from './AddCardForm'
import { CardItem } from './CardItem'

/**
 * リスト1列(例: 未着手)。見出しは、縦にスクロールしても上に残す(画面仕様 §3-③)。
 * 末尾に「＋ カードを追加」を置く。ただし「完了」のリストには置かない
 * (完了のリストにあるカードは、完了日時が記録されたカードのため)。
 */
export function ListColumn({ list, onCardAdded }: { list: ListView; onCardAdded: (card: CardView) => void }) {
  return (
    <section className="list" aria-label={list.name}>
      <header className="list-header">
        <h2 className="list-name">{list.name}</h2>
        <span className="list-count" aria-label={`${list.cardCount}件`}>
          {list.cardCount}
        </span>
      </header>

      {list.cards.length === 0 ? (
        <p className="list-empty">カードはありません</p>
      ) : (
        <ul className="list-cards">
          {list.cards.map((card) => (
            <li key={card.id}>
              <CardItem card={card} />
            </li>
          ))}
        </ul>
      )}

      {!list.doneList && <AddCardForm listId={list.id} onAdded={onCardAdded} />}
    </section>
  )
}

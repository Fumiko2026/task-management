import type { CardView } from '../api/types'
import { dueDisplay } from '../lib/formatDue'

/**
 * カード1枚。幅が狭いため、情報を絞って表示する(画面仕様 §3-④)。
 * いまは表示だけ。完了マークも、押しても何も起きない(完了の操作は次の段階で作る)。
 */
export function CardItem({ card, className = '' }: { card: CardView; className?: string }) {
  const done = card.completedAt !== null
  const due = dueDisplay(card)

  return (
    <article className={`card${done ? ' card--done' : ''}${className ? ` ${className}` : ''}`}>
      <div className="card-top">
        <span className="card-mark" role="img" aria-label={done ? '完了済み' : '未完了'}>
          {done ? '✔' : '○'}
        </span>
        <h3 className="card-title">{card.title}</h3>
      </div>

      {card.assigneeMissing ? (
        <p className="card-assignee card-assignee--missing">⚠ 担当者なし</p>
      ) : (
        <p className="card-assignee">👤 {card.assignee?.name}</p>
      )}

      {due && (
        <p className={`card-due card-due--${card.dueStatus.toLowerCase()}`}>
          <span aria-hidden="true">{due.icon}</span> {due.text}
        </p>
      )}

      {card.checklistTotal > 0 && (
        <div className="card-checklist">
          <span>
            ☑ {card.checklistDone}/{card.checklistTotal}
          </span>
          <progress
            max={card.checklistTotal}
            value={card.checklistDone}
            aria-label={`チェックリスト ${card.checklistTotal} 件中 ${card.checklistDone} 件が完了`}
          />
        </div>
      )}
    </article>
  )
}

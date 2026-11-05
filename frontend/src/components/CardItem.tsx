import type { CardView } from '../api/types'
import { dueDisplay } from '../lib/formatDue'

/** 完了マークのボタンを押したとき、ドラッグの開始や、編集ダイアログの表示に、伝わらないようにする。 */
const stopPropagation = (event: { stopPropagation: () => void }) => event.stopPropagation()

/**
 * カード1枚。幅が狭いため、情報を絞って表示する(画面仕様 §3-④)。
 * onToggleComplete を渡すと、完了マーク(○/✔)が押せるボタンになる(押せる範囲は 44×44px 以上)。
 * 渡さないとき(ドラッグ中に浮いているカードなど)は、表示だけ。
 * ボタンを押しても、カードのドラッグは始まらず、編集ダイアログも開かない。
 */
export function CardItem({
  card,
  className = '',
  onToggleComplete,
}: {
  card: CardView
  className?: string
  onToggleComplete?: (card: CardView) => void
}) {
  const done = card.completedAt !== null
  const due = dueDisplay(card)

  return (
    <article className={`card${done ? ' card--done' : ''}${className ? ` ${className}` : ''}`}>
      <div className="card-top">
        {onToggleComplete ? (
          <button
            type="button"
            className="card-mark card-mark-button"
            aria-label={done ? `未完了に戻す: ${card.title}` : `完了にする: ${card.title}`}
            onClick={(event) => {
              event.stopPropagation() // カードの「開く」に、伝えない
              onToggleComplete(card)
            }}
            // ドラッグの部品(マウス・タッチ・キーボード)と、カードの Enter / クリックに、伝えない
            onPointerDown={stopPropagation}
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
            onKeyDown={stopPropagation}
          >
            {done ? '✔' : '○'}
          </button>
        ) : (
          <span className="card-mark" role="img" aria-label={done ? '完了済み' : '未完了'}>
            {done ? '✔' : '○'}
          </span>
        )}
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

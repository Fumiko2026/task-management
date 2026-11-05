import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { Announcements, CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useState } from 'react'
import type { BoardView, CardView } from '../api/types'
import { countCards, findCard, moveCardInBoard } from '../lib/boardMove'
import type { CardPlace } from '../lib/boardMove'
import { parseDndId } from '../lib/dndIds'
import { CardItem } from './CardItem'
import { ListColumn } from './ListColumn'

/**
 * 当たり判定。マウスや指が、どれかのカードの上にあれば、そのカードを選ぶ。
 * カードの上でなければ、リストの上(空のリストなど)。キーボードのときは、いちばん近いものを選ぶ。
 */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  const cardHits = hits.filter((hit) => String(hit.id).startsWith('card-'))
  if (cardHits.length > 0) return cardHits
  if (hits.length > 0) return hits
  return closestCorners(args)
}

/** 読み上げの文(日本語)。画面が見えない人にも、いま何を動かしているかが伝わる。 */
function makeAnnouncements(board: BoardView): Announcements {
  const titleOf = (dndId: string | number): string => {
    const target = parseDndId(dndId)
    return board.lists.flatMap((l) => l.cards).find((c) => target?.kind === 'card' && c.id === target.id)?.title ?? 'カード'
  }
  const whereIs = (dndId: string | number): string => {
    const target = parseDndId(dndId)
    if (target?.kind !== 'card') return ''
    const place = findCard(board, target.id)
    const list = board.lists.find((l) => l.id === place?.listId)
    return list && place ? `「${list.name}」の ${place.index + 1} 番目` : ''
  }
  return {
    onDragStart: ({ active }) => `「${titleOf(active.id)}」を持ち上げました。`,
    onDragOver: ({ active }) => `「${titleOf(active.id)}」は、いま、${whereIs(active.id)}です。`,
    onDragEnd: ({ active }) => `「${titleOf(active.id)}」を、${whereIs(active.id)}に置きました。`,
    onDragCancel: ({ active }) => `「${titleOf(active.id)}」の移動を、取り消しました。`,
  }
}

/**
 * リストを横に並べて、カードをドラッグで入れ替えられるようにする(画面仕様 §3-④-b)。
 *
 * 流れ:
 *   - 持ち上げている間は、動かした様子を「仮のボード」(dragBoard)で、その場で見せる。
 *   - 置いたら、onMoveCard で、本物のボードへ反映し、保存する(失敗したら、元に戻る)。
 *   - 取り消したら、仮のボードを捨てて、元のまま。
 */
export function BoardColumns({
  board,
  onCardAdded,
  onMoveCard,
  onOpenCard,
  onToggleComplete,
}: {
  board: BoardView
  onCardAdded: (listId: number, card: CardView) => void
  onMoveCard: (cardId: number, from: CardPlace, to: CardPlace) => void
  onOpenCard: (cardId: number) => void
  onToggleComplete: (card: CardView) => void
}) {
  const [dragBoard, setDragBoard] = useState<BoardView | null>(null)
  const [activeCardId, setActiveCardId] = useState<number | null>(null)
  const shown = dragBoard ?? board

  const sensors = useSensors(
    // マウス: 約 8px 動かすと、ドラッグが始まる(クリックと区別するため)
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // タッチ: 約 0.5 秒の長押しで始まる。それより前の指の動きは、今までどおり、スクロール
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
    // キーボード: Space で持ち上げ、矢印で動かし、Space で置く(Enter は、編集ダイアログを開くために、使わない)
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: [KeyboardCode.Space], cancel: [KeyboardCode.Esc], end: [KeyboardCode.Space] },
    }),
  )

  function reset() {
    setDragBoard(null)
    setActiveCardId(null)
  }

  function onDragStart({ active }: DragStartEvent) {
    const target = parseDndId(active.id)
    if (target?.kind !== 'card') return
    setActiveCardId(target.id)
    setDragBoard(board)
    // 軽く振動(スマホ。対応していない端末では、何も起きない)
    navigator.vibrate?.(10)
  }

  /** 別のリストの上に来たら、そのリストの中に、仮に入れて見せる(同じリストの中の並べ替えは、置いたときに決める)。 */
  function onDragOver({ active, over }: DragOverEvent) {
    const dragged = parseDndId(active.id)
    const target = over ? parseDndId(over.id) : null
    if (!dragBoard || dragged?.kind !== 'card' || !over || !target) return

    const from = findCard(dragBoard, dragged.id)
    if (!from) return

    let toListId: number
    let toIndex: number
    if (target.kind === 'list') {
      // リストの空いているところの上。そのリストの最後に入れる
      toListId = target.id
      toIndex = countCards(dragBoard, toListId)
    } else {
      const overPlace = findCard(dragBoard, target.id)
      if (!overPlace) return
      toListId = overPlace.listId
      // 持ち上げたカードの中心が、重なったカードの中心より下なら、そのカードの後ろに入れる
      const dragRect = active.rect.current.translated
      const isBelow = dragRect ? dragRect.top + dragRect.height / 2 > over.rect.top + over.rect.height / 2 : false
      toIndex = overPlace.index + (isBelow ? 1 : 0)
    }
    if (toListId === from.listId) return
    setDragBoard(moveCardInBoard(dragBoard, dragged.id, toListId, toIndex))
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const dragged = parseDndId(active.id)
    const current = dragged?.kind === 'card' && dragBoard ? findCard(dragBoard, dragged.id) : null
    const start = dragged?.kind === 'card' ? findCard(board, dragged.id) : null
    let end = current

    // 同じリストの中で、別のカードの上に置いたら、そのカードの位置へ
    const target = over ? parseDndId(over.id) : null
    if (current && target?.kind === 'card' && dragBoard && dragged && target.id !== dragged.id) {
      const overPlace = findCard(dragBoard, target.id)
      if (overPlace && overPlace.listId === current.listId) end = overPlace
    }

    reset()
    if (dragged && start && end && (start.listId !== end.listId || start.index !== end.index)) {
      onMoveCard(dragged.id, start, end)
    }
  }

  const activeCard = activeCardId === null ? undefined : shown.lists.flatMap((l) => l.cards).find((c) => c.id === activeCardId)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
      accessibility={{
        announcements: makeAnnouncements(shown),
        screenReaderInstructions: {
          draggable:
            'カードを動かすには、Space キーで持ち上げ、矢印キーで動かし、もう一度 Space キーで置きます。Esc キーで取り消します。',
        },
      }}
    >
      <div className="lists">
        {shown.lists.map((list) => (
          <ListColumn
            key={list.id}
            list={list}
            onCardAdded={(card) => onCardAdded(list.id, card)}
            onOpenCard={onOpenCard}
            onToggleComplete={onToggleComplete}
          />
        ))}
      </div>
      {/* 持ち上げているカード。指やマウスについてくる */}
      <DragOverlay>{activeCard ? <CardItem card={activeCard} className="card--overlay" /> : null}</DragOverlay>
    </DndContext>
  )
}

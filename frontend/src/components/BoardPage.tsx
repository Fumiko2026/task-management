import { useBoard } from '../hooks/useBoard'
import { BoardHeader } from './BoardHeader'
import { BoardSkeleton } from './BoardSkeleton'
import { ErrorMessage } from './ErrorMessage'
import { ListColumn } from './ListColumn'

/** ボード画面(画面仕様 S-03)。API から読み込んだボードを、リストとカードで見せる。読み取り専用。 */
export function BoardPage() {
  const { state, reload } = useBoard()

  switch (state.status) {
    case 'loading':
      return (
        <div className="page">
          <BoardHeader title="タスク管理" />
          <BoardSkeleton />
        </div>
      )

    case 'error':
      return (
        <div className="page">
          <BoardHeader title="タスク管理" />
          <ErrorMessage detail={state.message} onRetry={reload} />
        </div>
      )

    case 'empty':
      return (
        <div className="page">
          <BoardHeader title="タスク管理" />
          <div className="notice" role="status">
            <p className="notice-title">{state.message}</p>
          </div>
        </div>
      )

    case 'ready': {
      const { board } = state
      const noCards = board.lists.every((list) => list.cards.length === 0)
      return (
        <div className="page">
          <BoardHeader title={board.name} />
          {noCards && <p className="board-guide">最初のカードを追加しましょう</p>}
          <div className="lists">
            {board.lists.map((list) => (
              <ListColumn key={list.id} list={list} />
            ))}
          </div>
        </div>
      )
    }
  }
}

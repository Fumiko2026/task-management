/** 読み込み中の表示。カードの形をした灰色の枠を出す(画面仕様 §7)。 */
export function BoardSkeleton() {
  return (
    <div className="lists" role="status" aria-busy="true">
      <span className="visually-hidden">読み込み中</span>
      {[0, 1, 2].map((i) => (
        <div className="list skeleton-list" key={i} aria-hidden="true">
          <div className="skeleton skeleton-heading" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      ))}
    </div>
  )
}

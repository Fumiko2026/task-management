/** ボードの名前を出すヘッダー。長いときは、末尾を「…」で省略する(画面仕様 §3-①)。 */
export function BoardHeader({ title }: { title: string }) {
  return (
    <header className="board-header">
      <h1 className="board-title" title={title}>
        {title}
      </h1>
    </header>
  )
}

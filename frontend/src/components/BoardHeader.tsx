/**
 * 画面の上のヘッダー。アプリの名前「Kokuban」と、ボードの名前を出す。
 * ボードの名前が長いときは、末尾を「…」で省略する(画面仕様 §3-①)。
 * ボードの名前が無いとき(読み込み中など)は、「Kokuban」が見出しになる。
 */
export function BoardHeader({ title }: { title?: string }) {
  return (
    <header className="board-header">
      {title === undefined ? (
        <h1 className="board-brand">Kokuban</h1>
      ) : (
        <>
          <span className="board-brand">Kokuban</span>
          <h1 className="board-title" title={title}>
            {title}
          </h1>
        </>
      )}
    </header>
  )
}

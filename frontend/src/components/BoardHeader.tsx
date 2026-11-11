/** 画面の上に出す、アプリのタイトル。 */
const APP_TITLE = 'Taskboard Kokuban'

/**
 * 画面の上のヘッダー。タイトル「Taskboard Kokuban」を出す。
 * ボードの名前は、画面には出さず、読み上げ用の見出しとして残す(visually-hidden)。
 * ボードの名前が無いとき(読み込み中など)は、タイトルが見出しになる。
 */
export function BoardHeader({ title }: { title?: string }) {
  return (
    <header className="board-header">
      {title === undefined ? (
        <h1 className="board-brand">{APP_TITLE}</h1>
      ) : (
        <>
          <span className="board-brand">{APP_TITLE}</span>
          <h1 className="visually-hidden">{title}</h1>
        </>
      )}
    </header>
  )
}

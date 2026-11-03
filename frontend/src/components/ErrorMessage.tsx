/** 読み込みに失敗したときの表示(画面仕様 §7)。「もう一度試す」で、読み込み直せる。 */
export function ErrorMessage({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <div className="notice notice--error" role="alert">
      <p className="notice-title">読み込めませんでした</p>
      <p className="notice-detail">{detail}</p>
      <button type="button" className="button" onClick={onRetry}>
        もう一度試す
      </button>
    </div>
  )
}

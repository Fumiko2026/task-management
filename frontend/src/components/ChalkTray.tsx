/**
 * 黒板の下の「チョーク受け」。チョークと黒板消しのイラストを置く、飾りの部品。
 * パソコンの幅(768px 以上)のときだけ表示する(CSS で切り替える)。
 * 飾りなので、読み上げには出さない(aria-hidden)。押せない・ドラッグの邪魔をしない(pointer-events: none)。
 */
export function ChalkTray() {
  return (
    <div className="chalk-tray" aria-hidden="true" data-testid="chalk-tray">
      <svg className="chalk-art" viewBox="0 0 260 40" width="338" height="52" focusable="false">
        {/* チョーク(白・ピンク・黄・青) */}
        <rect x="14" y="27" width="40" height="10" rx="3" fill="#f6f3e7" transform="rotate(-4 34 32)" />
        <rect x="52" y="29" width="34" height="9" rx="3" fill="#f4b6c2" transform="rotate(3 69 33)" />
        <rect x="84" y="26" width="30" height="9" rx="3" fill="#f7e08a" transform="rotate(-8 99 30)" />
        <rect x="112" y="29" width="32" height="9" rx="3" fill="#a9d6f5" transform="rotate(2 128 33)" />
        {/* 黒板消し(木の本体と、フェルト) */}
        <rect x="168" y="12" width="78" height="26" rx="4" fill="#b98a55" />
        <rect x="168" y="12" width="78" height="7" rx="3" fill="#cfa46d" />
        <rect x="168" y="29" width="78" height="9" rx="3" fill="#2f3a3f" />
        <rect x="172" y="31" width="30" height="3" rx="1.5" fill="#e8e2d0" opacity="0.7" />
      </svg>
    </div>
  )
}

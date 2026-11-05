// テストの共通の準備。画面の確認用の道具(toBeInTheDocument など)を使えるようにする。
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom(テストの環境)には、<dialog> の showModal() と close() が無い。本物の動きのうち、
// 「開く・閉じる」と、閉じたときの close イベントだけを、代わりに用意する。
if (typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

// 各テストのあとに、画面に出した部品と、差し替えた fetch を元に戻す
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

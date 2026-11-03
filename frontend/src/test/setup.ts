// テストの共通の準備。画面の確認用の道具(toBeInTheDocument など)を使えるようにする。
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// 各テストのあとに、画面に出した部品と、差し替えた fetch を元に戻す
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

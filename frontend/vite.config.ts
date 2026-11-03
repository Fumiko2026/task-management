import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 5173 が使われていても、別のポート(5174 など)へ勝手に移らない。使われていたら、エラーで止まる。
    // (./dev.sh front は、起動の前に、5173 を使っているプロセスを止める)
    strictPort: true,
    // 開発中は、/api で始まる通信をバックエンド(Spring Boot)へ中継する。
    // ブラウザから見ると同じ場所への通信になるので、CORS(別の場所からの通信の許可)の設定は要らない。
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})

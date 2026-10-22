import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 可用 API_URL 環境變數改指向其他後端位址
const api = process.env.API_URL ?? 'http://localhost:5122'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': api,
      // Google 登入回呼由後端處理
      '/signin-google': api,
    },
  },
})

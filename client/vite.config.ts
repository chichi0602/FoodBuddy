import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 可用 API_URL 環境變數改指向其他後端位址
      '/api': process.env.API_URL ?? 'http://localhost:5122',
    },
  },
})

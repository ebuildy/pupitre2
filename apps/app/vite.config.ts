import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiUrl = process.env.API_URL ?? 'http://localhost:3001'

// Single hostname (spec 004): the browser only talks to the app origin, /api is proxied to the API.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT ?? 3000),
    strictPort: true,
    proxy: {
      '/api': { target: apiUrl, changeOrigin: false },
      '/health': { target: apiUrl },
    },
  },
  preview: {
    port: Number(process.env.PORT ?? 3000),
    strictPort: true,
    proxy: {
      '/api': { target: apiUrl, changeOrigin: false },
    },
  },
})

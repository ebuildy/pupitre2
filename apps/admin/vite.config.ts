import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiUrl = process.env.API_URL ?? 'http://localhost:3001'

// Served under /admin/ on the same origin as the learner app, which proxies /admin to this
// server in dev. The /api proxy here only serves direct visits to this port.
export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT ?? 3002),
    strictPort: true,
    proxy: {
      '/api': { target: apiUrl },
      '/uploads': { target: apiUrl },
    },
  },
  preview: {
    port: Number(process.env.PORT ?? 3002),
    strictPort: true,
    proxy: {
      '/api': { target: apiUrl },
    },
  },
})

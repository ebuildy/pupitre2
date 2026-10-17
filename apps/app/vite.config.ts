import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

const apiUrl = process.env.API_URL ?? 'http://localhost:3001'
const adminUrl = process.env.ADMIN_URL ?? 'http://localhost:3002'

// Single hostname (spec 004): the browser only talks to this origin, which proxies
// /api to the API and /admin to the admin app (apps/admin, built with base `/admin/`).
const proxy: Record<string, ProxyOptions> = {
  '/api': { target: apiUrl, xfwd: true }, // client IP for rate limiting (spec 009)
  '/health': { target: apiUrl },
  '/uploads': { target: apiUrl },
  '^/admin(/|$)': {
    target: adminUrl,
    ws: true, // admin app HMR
    rewrite: (path) => (path === '/admin' ? '/admin/' : path),
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT ?? 3000),
    strictPort: true,
    proxy,
  },
  preview: {
    port: Number(process.env.PORT ?? 3000),
    strictPort: true,
    proxy,
  },
})

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forwards /api/* to the FastAPI server during `npm run dev`, matching
    // how vercel.json routes them in production. Defaults to a local
    // uvicorn; docker compose points it at the backend container.
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:8000',
    },
    // File-change events don't always reach containers (notably on
    // Windows), so compose can switch to polling.
    watch: { usePolling: process.env.VITE_USE_POLLING === 'true' },
  },
})

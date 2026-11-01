import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forwards /api/* to the FastAPI server during `npm run dev`, matching
    // how vercel.json routes them in production. Defaults to a local
    // uvicorn; docker compose points it at the backend container.
    // changeOrigin sends the target's own Host header, which Vercel needs to
    // route a request when this points at a hosted deployment.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
    // File-change events don't always reach containers (notably on
    // Windows), so compose can switch to polling.
    watch: { usePolling: process.env.VITE_USE_POLLING === 'true' },
  },
  // The editor (and so TipTap) is lazy-loaded. Pre-bundling TipTap at
  // startup stops the dev server from re-optimizing mid-session, which
  // fails that first lazy import ("504 Outdated Optimize Dep").
  optimizeDeps: {
    include: [
      '@tiptap/core',
      '@tiptap/react',
      '@tiptap/html',
      '@tiptap/starter-kit',
      '@tiptap/extension-blockquote',
      '@tiptap/extension-document',
      '@tiptap/extension-hard-break',
      '@tiptap/extension-link',
      '@tiptap/extension-list',
      '@tiptap/extension-table',
    ],
  },
  // `npm test` (Vitest) runs the tests kept next to the code in src/.
  test: { include: ['src/**/*.test.{js,jsx}'] },
})

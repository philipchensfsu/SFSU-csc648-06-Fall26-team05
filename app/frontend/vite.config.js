import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forwards /api/* to the local FastAPI server (uvicorn main:app, default
    // port 8000) during `npm run dev`, matching how vercel.json routes them
    // in production.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})

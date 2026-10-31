import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // MCP server runs separately (npm run mcp) on :8787
      '/mcp': 'http://localhost:8787',
      '/oauth': 'http://localhost:8787',
      '/.well-known': 'http://localhost:8787',
    },
  },
})

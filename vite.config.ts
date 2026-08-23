import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  /**
   * Browsers hand out autoplay per origin, and they earn it back over repeated
   * visits. A dev server that quietly moves to the next free port hands the
   * player a new origin every time - 5173, then 5174, then 5175 - so that
   * credit never accumulates and the lobby track is refused on every reload.
   * Hold the port, and say so when it is taken, rather than drifting.
   */
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})

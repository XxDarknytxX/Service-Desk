// 1. UPDATE: vite.config.js (remove the Vite plugin, go back to PostCSS)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    // Remove the tailwindcss plugin - we'll use PostCSS instead
  ],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'build'
  }
})
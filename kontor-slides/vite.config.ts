import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative asset paths: the same build runs on any web path and inside the desktop app.
export default defineConfig({
  base: './',
  plugins: [react()],
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/pirate-game/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor/index.html',
      },
    },
  },
})

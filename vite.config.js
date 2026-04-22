import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // ✅ THIS is what you need
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        tooltovisualisemusic: 'tooltovisualisemusic.html'
      },
    },
  },
})
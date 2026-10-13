import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        tooltovisualisemusic: 'tooltovisualisemusic.html'
      },
    },
  },
})

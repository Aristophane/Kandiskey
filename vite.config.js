import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/tooltovisualisemusic/' : '/',
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: { tooltovisualisemusic: 'tooltovisualisemusic.html' },
    },
  },
}))

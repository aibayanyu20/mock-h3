import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { mockH3 } from './lib/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    mockH3({
      builder: 'esbuild',
      h3Config: {
        debug: true,
      },
    }),
  ],
})

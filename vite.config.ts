import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { mockH3 } from './lib/index'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    mockH3(),
  ],
})

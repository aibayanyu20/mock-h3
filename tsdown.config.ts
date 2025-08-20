import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: './lib/index.ts',
    vite: './lib/vite.ts',
    prod: './lib/prod.ts',
  },
  dts: true,
  clean: true,
  outDir: './dist',
  format: 'esm',
  tsconfig: './tsconfig.lib.json',
  external: ['vite', 'tsup', 'esbuild'],
})

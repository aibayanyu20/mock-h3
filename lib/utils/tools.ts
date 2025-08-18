import type { MockH3Ctx } from '../types'
import pathe from 'pathe'
import { normalizePath } from 'vite'

export function getBasePath(ctx: MockH3Ctx) {
  const cwd = ctx.resolveConfig?.root || process.cwd()
  return normalizePath(pathe.resolve(cwd, ctx.srcDir))
}

export function getOutputPath(ctx: MockH3Ctx) {
  const cwd = ctx.resolveConfig?.root || process.cwd()
  const outputDir = ctx.outputDir || 'dist/servers'
  return normalizePath(pathe.resolve(cwd, outputDir))
}

import type { PluginOption } from 'vite'
import type { MockH3Ctx, MockH3Options } from './types'
import { createLogger } from 'vite'
import { createBuild } from './build/create-build'
import { createServer } from './server'

function mockH3(options: MockH3Options = {}): PluginOption {
  const {
    srcDir = 'servers',
    outputDir = 'dist/servers',
    build = true,
    tsdownOptions = {},
    prefix = '/api',
    h3Config = {},
  } = options
  const logger = createLogger('info', { prefix: '[mock:h3]' })
  const ctx: MockH3Ctx = {
    logger,
    srcDir,
    outputDir,
    build,
    tsdownOptions,
    prefix,
    registeredRoutes: new Set<string>(),
    h3Config,
  }
  return {
    name: 'mock:h3',
    configResolved(config) {
      // 加载vite的配置信息
      ctx.resolveConfig = config
    },
    async configureServer(server) {
      ctx.server = server
      ctx.isPreviewSever = false
      await createServer(ctx)
    },
    async configurePreviewServer(server) {
      ctx.server = server
      ctx.isPreviewSever = true
      await createServer(ctx)
    },
    async generateBundle() {
      if (ctx.build) {
        await createBuild(ctx)
      }
    },
  }
}

export {
  mockH3,
}

export type { MockH3Options } from './types'

export default mockH3

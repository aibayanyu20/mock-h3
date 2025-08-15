import type { ViteDevServer } from 'vite'
import type { Method, MockH3Ctx } from '../types'
import chalk from 'chalk'
import { H3, toNodeHandler } from 'h3'
import pathe from 'pathe'
import { glob } from 'tinyglobby'
import { normalizePath } from 'vite'

function getBasePath(ctx: MockH3Ctx) {
  const cwd = ctx.resolveConfig?.root || process.cwd()
  return normalizePath(pathe.resolve(cwd, ctx.srcDir))
}

function generateRoutePath(basePath: string, mockPath: string, baseUrl: string) {
  if (mockPath === '.')
    mockPath = ''

  if (basePath === 'index')
    basePath = ''

  let path = normalizePath(pathe.join(baseUrl, mockPath, basePath))
  if (path.endsWith('/')) {
    // 移除末尾的/
    path = path.slice(0, -1)
  }
  return path
}

// 扫描文件夹信息
async function scanFiles(ctx: MockH3Ctx, dir: string = 'routes') {
  // 扫描文件夹
  const serverDir = pathe.resolve(getBasePath(ctx), dir)
  try {
    const files = await glob('**/*.{js,ts}', {
      cwd: serverDir,
      ignore: [
        '**/*.spec.{js,ts}',
        '**/*.test.{js,ts}',
        '**/*.d.{js,ts}',
      ],
    })
    return files
  } catch {
    // 如果目录不存在，返回空数组
    return []
  }
}

// 扫描中间件文件
async function scanMiddlewareFiles(ctx: MockH3Ctx) {
  return await scanFiles(ctx, 'middleware')
}

// 扫描插件文件
async function scanPluginFiles(ctx: MockH3Ctx) {
  return await scanFiles(ctx, 'plugins')
}

// 生成路由的唯一标识
function generateRouteKey(file: string, method: string): string {
  return `route:${method.toUpperCase()}:${file}`
}

// 生成中间件的唯一标识
function generateMiddlewareKey(file: string): string {
  return `middleware:${file}`
}

// 生成插件的唯一标识
function generatePluginKey(file: string): string {
  return `plugin:${file}`
}
function checkPrefix(ctx: MockH3Ctx) {
  const prefix = ctx.prefix || '/api'
  if (!prefix.startsWith('/')) {
    ctx.prefix = `/${prefix}`
  }
}

const validMethods: Method[] = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']

// 从文件路径生成路由信息
function getRouteInfoFromFile(file: string, ctx: MockH3Ctx) {
  const baseName = normalizePath(pathe.basename(file))
  const baseDir = normalizePath(pathe.dirname(file))
  const paths = baseName.split('.')

  if (paths.length < 2) {
    return null
  }

  const path = paths[0]
  let method = paths[1] || 'get'
  if (method === 'ts' || method === 'js')
    method = 'get'
  if (!validMethods.includes(method as Method)) {
    method = 'get'
  }

  const routePath = generateRoutePath(path, baseDir, '/')
  const logPath = generateRoutePath(path, baseDir, ctx.prefix)
  const routeKey = generateRouteKey(file, method)

  return {
    file,
    method,
    routePath,
    logPath,
    routeKey,
  }
}

// 加载单个路由文件
async function addRouteFile(file: string, ctx: MockH3Ctx, payload: Record<string, any> = {}) {
  const routeInfo = getRouteInfoFromFile(file, ctx)
  if (!routeInfo) {
    ctx.logger.warn(`Invalid route file name format: ${file}`)
    return
  }

  const { method, routePath, logPath, routeKey } = routeInfo
  const fullPath = pathe.resolve(getBasePath(ctx), 'routes', file)

  try {
    const module = await import(`${fullPath}?v=${Date.now()}`)
    if (module && module.default) {
      const _default = module.default
      ctx.h3?.on(method as Method, routePath, _default)
    } else {
      ctx.h3?.on(method as Method, routePath, () => 'Mock File Is Not Exist Please Check')
    }

    const eventName = payload.eventName || 'init'
    const changedFiles = payload.changedFiles || new Set()

    if (eventName === 'init') {
      ctx.logger.info(`${chalk.green('+')} Registered new mock route: ${chalk.cyan(logPath)} ${chalk.gray(`[${method.toUpperCase()}]`)}`, {
        timestamp: true,
      })
      ctx.registeredRoutes.add(routeKey)
    } else if (changedFiles.has(file)) {
      const isNewRoute = !ctx.registeredRoutes.has(routeKey)

      if (eventName === 'add' || isNewRoute) {
        ctx.logger.info(`${chalk.green('+')} Added new mock route: ${chalk.cyan(logPath)} ${chalk.gray(`[${method.toUpperCase()}]`)}`, {
          timestamp: true,
        })
        ctx.registeredRoutes.add(routeKey)
      } else if (eventName === 'change') {
        ctx.logger.info(`${chalk.yellow('~')} Updated mock route: ${chalk.cyan(logPath)} ${chalk.gray(`[${method.toUpperCase()}]`)}`, {
          timestamp: true,
        })
      }
    }
  } catch (error) {
    ctx.logger.error(`Failed to load route file ${file}: ${error}`)
  }
}

// 加载单个中间件文件
async function addMiddlewareFile(file: string, ctx: MockH3Ctx, payload: Record<string, any> = {}) {
  const fullPath = pathe.resolve(getBasePath(ctx), 'middleware', file)
  const middlewareKey = generateMiddlewareKey(file)

  try {
    const module = await import(`${fullPath}?v=${Date.now()}`)

    if (module && module.default) {
      const middleware = module.default
      if (typeof middleware === 'function') {
        ctx.h3?.use(middleware)

        const eventName = payload.eventName || 'init'
        const changedFiles = payload.changedFiles || new Set()

        if (eventName === 'init') {
          ctx.logger.info(`${chalk.green('+')} Registered middleware: ${chalk.cyan(file)}`, {
            timestamp: true,
          })
          ctx.registeredRoutes.add(middlewareKey)
        } else if (changedFiles.has(file)) {
          const isNewMiddleware = !ctx.registeredRoutes.has(middlewareKey)

          if (eventName === 'add' || isNewMiddleware) {
            ctx.logger.info(`${chalk.green('+')} Added middleware: ${chalk.cyan(file)}`, {
              timestamp: true,
            })
            ctx.registeredRoutes.add(middlewareKey)
          } else if (eventName === 'change') {
            ctx.logger.info(`${chalk.yellow('~')} Updated middleware: ${chalk.cyan(file)}`, {
              timestamp: true,
            })
          }
        }
      } else {
        ctx.logger.warn(`Middleware file ${file} does not export a function`)
      }
    } else {
      ctx.logger.warn(`Middleware file ${file} does not have a default export`)
    }
  } catch (error) {
    ctx.logger.error(`Failed to load middleware file ${file}: ${error}`)
  }
}

// 加载单个插件文件
async function addPluginFile(file: string, ctx: MockH3Ctx, payload: Record<string, any> = {}) {
  const fullPath = pathe.resolve(getBasePath(ctx), 'plugins', file)
  const pluginKey = generatePluginKey(file)

  try {
    const module = await import(`${fullPath}?v=${Date.now()}`)

    if (module && module.default) {
      const plugin = module.default
      if (typeof plugin === 'function') {
        ctx.h3?.use(plugin())

        const eventName = payload.eventName || 'init'
        const changedFiles = payload.changedFiles || new Set()

        if (eventName === 'init') {
          ctx.logger.info(`${chalk.green('+')} Registered plugin: ${chalk.cyan(file)}`, {
            timestamp: true,
          })
          ctx.registeredRoutes.add(pluginKey)
        } else if (changedFiles.has(file)) {
          const isNewPlugin = !ctx.registeredRoutes.has(pluginKey)

          if (eventName === 'add' || isNewPlugin) {
            ctx.logger.info(`${chalk.green('+')} Added plugin: ${chalk.cyan(file)}`, {
              timestamp: true,
            })
            ctx.registeredRoutes.add(pluginKey)
          } else if (eventName === 'change') {
            ctx.logger.info(`${chalk.yellow('~')} Updated plugin: ${chalk.cyan(file)}`, {
              timestamp: true,
            })
          }
        }
      } else {
        ctx.logger.warn(`Plugin file ${file} does not export a function`)
      }
    } else {
      ctx.logger.warn(`Plugin file ${file} does not have a default export`)
    }
  } catch (error) {
    ctx.logger.error(`Failed to load plugin file ${file}: ${error}`)
  }
}

// 为了防止频繁的更新，写一个防抖函数
function debounce(fn: (...args: any[]) => void, delay: number) {
  let timeout: NodeJS.Timeout
  return (...args: any[]) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      fn(...args)
    }, delay)
  }
}

// 加载路由文件
export async function loadRouteFiles(ctx: MockH3Ctx, payload: Record<string, any> = {}) {
  if (!ctx.h3) {
    return
  }

  const eventName = payload.eventName || 'init'
  const changedPath = payload.path
  const changedFiles = new Set<string>()

  // 获取所有路由文件
  const routeFiles = await scanFiles(ctx, 'routes')

  // 如果是文件变更事件，确定哪些文件实际发生了变化
  if (changedPath) {
    const basePath = getBasePath(ctx)
    const routesPath = pathe.join(basePath, 'routes')

    // 检查变更的文件是否是路由文件
    if (changedPath.startsWith(routesPath)) {
      const relativePath = normalizePath(pathe.relative(routesPath, changedPath))
      if (routeFiles.includes(relativePath) || eventName === 'unlink') {
        changedFiles.add(relativePath)
      }
    }
  }

  // 传递变更信息给 addRouteFile 函数
  const payloadWithChanges = {
    ...payload,
    changedFiles,
  }

  // 对于 unlink 事件，只处理被删除的文件
  if (eventName === 'unlink') {
    if (changedFiles.size > 0) {
      for (const file of changedFiles) {
        const routeInfo = getRouteInfoFromFile(file, ctx)
        if (routeInfo) {
          const { logPath, method, routeKey } = routeInfo
          ctx.logger.info(`${chalk.red('-')} Removed mock route: ${chalk.cyan(logPath)} ${chalk.gray(`[${method.toUpperCase()}]`)}`, {
            timestamp: true,
          })
          ctx.registeredRoutes.delete(routeKey)
        }
      }
    }
  } else {
    await Promise.all(routeFiles.map(file => addRouteFile(file, ctx, payloadWithChanges)))
  }
}

// 加载中间件文件
export async function loadMiddlewareFiles(ctx: MockH3Ctx, payload: Record<string, any> = {}) {
  if (!ctx.h3) {
    return
  }

  const eventName = payload.eventName || 'init'
  const changedPath = payload.path
  const changedFiles = new Set<string>()

  // 获取所有中间件文件
  const middlewareFiles = await scanMiddlewareFiles(ctx)

  // 如果是文件变更事件，确定哪些文件实际发生了变化
  if (changedPath) {
    const basePath = getBasePath(ctx)
    const middlewarePath = pathe.join(basePath, 'middleware')

    // 检查变更的文件是否是中间件文件
    if (changedPath.startsWith(middlewarePath)) {
      const relativePath = normalizePath(pathe.relative(middlewarePath, changedPath))
      if (middlewareFiles.includes(relativePath) || eventName === 'unlink') {
        changedFiles.add(relativePath)
      }
    }
  }

  const payloadWithChanges = {
    ...payload,
    changedFiles,
  }

  if (eventName === 'unlink') {
    if (changedFiles.size > 0) {
      for (const file of changedFiles) {
        const middlewareKey = generateMiddlewareKey(file)
        ctx.logger.info(`${chalk.red('-')} Removed middleware: ${chalk.cyan(file)}`, {
          timestamp: true,
        })
        ctx.registeredRoutes.delete(middlewareKey)
      }
    }
  } else {
    await Promise.all(middlewareFiles.map(file => addMiddlewareFile(file, ctx, payloadWithChanges)))
  }
}

// 加载插件文件
export async function loadPluginFiles(ctx: MockH3Ctx, payload: Record<string, any> = {}) {
  if (!ctx.h3) {
    return
  }

  const eventName = payload.eventName || 'init'
  const changedPath = payload.path
  const changedFiles = new Set<string>()

  // 获取所有插件文件
  const pluginFiles = await scanPluginFiles(ctx)

  // 如果是文件变更事件，确定哪些文件实际发生了变化
  if (changedPath) {
    const basePath = getBasePath(ctx)
    const pluginsPath = pathe.join(basePath, 'plugins')

    // 检查变更的文件是否是插件文件
    if (changedPath.startsWith(pluginsPath)) {
      const relativePath = normalizePath(pathe.relative(pluginsPath, changedPath))
      if (pluginFiles.includes(relativePath) || eventName === 'unlink') {
        changedFiles.add(relativePath)
      }
    }
  }

  const payloadWithChanges = {
    ...payload,
    changedFiles,
  }

  if (eventName === 'unlink') {
    if (changedFiles.size > 0) {
      for (const file of changedFiles) {
        const pluginKey = generatePluginKey(file)
        ctx.logger.info(`${chalk.red('-')} Removed plugin: ${chalk.cyan(file)}`, {
          timestamp: true,
        })
        ctx.registeredRoutes.delete(pluginKey)
      }
    }
  } else {
    await Promise.all(pluginFiles.map(file => addPluginFile(file, ctx, payloadWithChanges)))
  }
}

// 分别对文件进行相应的处理和转换
export async function createServer(ctx: MockH3Ctx) {
  if (!ctx.server) {
    throw new Error('Vite server is not defined')
  }
  // 处理路由的前缀信息
  checkPrefix(ctx)
  const server = ctx.server
  ctx.h3 = new H3(ctx.h3Config)

  /**
   * 重新加载所有文件
   */
  const _loadAll = async (ctx: MockH3Ctx, payload: Record<string, any> = {}) => {
    // 按顺序加载：插件 -> 中间件 -> 路由
    await loadPluginFiles(ctx, payload)
    await loadMiddlewareFiles(ctx, payload)
    await loadRouteFiles(ctx, payload)
  }

  // 初始加载
  const initPayload = {
    eventName: 'init',
    path: '',
    changedFiles: new Set<string>(),
  }
  await _loadAll(ctx, initPayload)

  if (!ctx.isPreviewSever) {
    const _debouncedLoad = debounce(_loadAll, 200)
    const watcher = (server as ViteDevServer).watcher

    watcher.on('all', async (eventName, path) => {
      const basePath = getBasePath(ctx)
      const _path = normalizePath(path)

      if (!_path.startsWith(basePath)) {
        return
      }

      // 检查是否是我们关心的目录
      const routesPath = pathe.join(basePath, 'routes')
      const middlewarePath = pathe.join(basePath, 'middleware')
      const pluginsPath = pathe.join(basePath, 'plugins')

      if (!_path.startsWith(routesPath) && !_path.startsWith(middlewarePath) && !_path.startsWith(pluginsPath)) {
        return
      }

      // 检查是否是有效的文件
      if (!_path.match(/\.(js|ts)$/) || _path.match(/\.(spec|test|d)\.(js|ts)$/)) {
        return
      }

      // 对于删除事件，立即处理，不使用防抖
      if (eventName === 'unlink') {
        await _loadAll(ctx, {
          eventName,
          path: _path,
        })
      } else {
        // 重新创建 H3 实例
        ctx.h3 = new H3(ctx.h3Config)

        // 对于其他事件使用防抖
        await _debouncedLoad(ctx, {
          eventName,
          path: _path,
        })
      }
    })
  }

  if (server.printUrls) {
    const _printUrls = server.printUrls
    server.printUrls = () => {
      console.log('Printed URLs')
      _printUrls()
    }
  }

  // 加载到路由配置文件中
  server.middlewares.use(ctx.prefix, (req, res) => {
    const h3 = ctx.h3!
    return toNodeHandler(h3)(req, res)
  })
}

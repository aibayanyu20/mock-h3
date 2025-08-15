import type { ViteDevServer } from 'vite'
import type { Method, MockH3Ctx } from '../types'
import { H3, toNodeHandler } from 'h3'
import pathe from 'pathe'
import { createRouter } from 'rou3'
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
  const files = await glob('**/*.{js,ts}', {
    cwd: serverDir,
    ignore: [
      '**/*.spec.{js,ts}',
      '**/*.test.{js,ts}',
      '**/*.d.{js,ts}',
    ],
  })
  return files
}
function checkPrefix(ctx: MockH3Ctx) {
  const prefix = ctx.prefix || '/api'
  if (!prefix.startsWith('/')) {
    ctx.prefix = `/${prefix}`
  }
}

const validMethods: Method[] = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']

async function addFile(file: string, ctx: MockH3Ctx) {
  const baseName = normalizePath(pathe.basename(file))
  const baseDir = normalizePath(pathe.dirname(file))
  const paths = baseName.split('.')
  if (paths.length < 2) {
    ctx.logger.warn(`Invalid mock file name format: ${file}`)
    return
  }

  const path = paths[0]
  let method = paths[1] || 'get'
  if (method === 'ts' || method === 'js')
    method = 'get'
  if (!validMethods.includes(method as Method)) {
    ctx.logger.warn(`Invalid HTTP method "${method}" in file ${file}, defaulting to GET`)
    method = 'get'
  }
  const fullPath = pathe.resolve(getBasePath(ctx), 'routes', file)
  const module = await import(`${fullPath}?v=${Date.now()}`)

  const routePath = generateRoutePath(path, baseDir, '/')
  if (module && module.default) {
    const _default = module.default
    if (typeof _default === 'function') {
      // console.log(_default?.())
      ctx.h3?.on(method as Method, routePath, _default)
    } else {
      ctx.h3?.on(method as Method, routePath, () => 'Mock File Is Not A Function')
    }
  } else {
    ctx.h3?.on(method as Method, routePath, () => 'Mock File Is Not Exist Please Check')
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

export async function loadRouteFiles(ctx: MockH3Ctx) {
  console.log('Sdsd')
  if (!ctx.h3) {
    return
  }
  const routeFiles = await scanFiles(ctx, 'routes')
  await Promise.all(routeFiles.map(file => addFile(file, ctx)))
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

  await loadRouteFiles(ctx)
  if (!ctx.isPreviewSever) {
    const _loadRouteFiles = debounce(loadRouteFiles, 200)
    const watcher = (server as ViteDevServer).watcher
    watcher.on('all', async (_, path) => {
      // 去相对的路径
      const basePath = getBasePath(ctx)
      const _path = normalizePath(path)
      if (!_path.startsWith(basePath)) {
        return
      }
      const relativePath = pathe.relative(basePath, path)
      ctx.h3 = new H3(ctx.h3Config)
      if (relativePath.startsWith('routes')) {
        // 直接重载所有的路由信息
        await _loadRouteFiles(ctx)
      } else if (relativePath.startsWith('middleware')) {
        // TODO
      } else if (relativePath.startsWith('plugins')) {
        // 如果是这个目录下面的
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

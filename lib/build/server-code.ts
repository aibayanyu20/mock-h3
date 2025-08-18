import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { H3, serve, serveStatic } from 'h3'
import pathe from 'pathe'
import { glob } from 'tinyglobby'

function generateRoutePath(basePath: string, mockPath: string, baseUrl: string) {
  if (mockPath === '.')
    mockPath = ''

  if (basePath === 'index')
    basePath = ''

  let path = pathe.join(baseUrl, mockPath, basePath)
  if (path.endsWith('/')) {
    // 移除末尾的/
    path = path.slice(0, -1)
  }
  return path
}

const validMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']

function getMethod(filePath: string) {
  const fileName = pathe.basename(filePath)
  const paths = fileName.split('.')
  const method = paths[0]
  if (validMethods.includes(method)) {
    return method
  }
  return 'get'
}

async function createSever() {
  const app = new H3()
  const baseDir = pathe.dirname(fileURLToPath(import.meta.url))

  const prefix = '/api'

  // 静态资源配置
  app.use('/**', (event) => {
    const uri = event.url
    if (uri.pathname.startsWith(prefix)) {
      return
    }
    const getFilePath = (id) => {
      if (id.startsWith('/')) {
        id = id.slice(1)
      }
      // 如果文件不存在后缀，那么就返回根目录
      if (!/\.[a-z0-9]+$/i.test(id)) {
        return pathe.join(baseDir, '../', 'index.html')
      }
      return pathe.join(baseDir, '../', id)
    }

    return serveStatic(event, {
      indexNames: ['index.html'],
      getContents: (id) => {
        return fs.readFile(getFilePath(id), 'utf-8')
      },
      getMeta: async (id) => {
        const stats = await fs.stat(getFilePath(id)).catch(() => {
        })
        if (stats?.isFile()) {
          return {
            size: stats.size,
            mtime: stats.mtimeMs,
          }
        }
      },
    })
  })
  // 定义扫描函数
  const scanFiles = async (dir: string) => {
    const cwd = pathe.resolve(baseDir, dir)
    return await glob('**/*.mjs', { cwd })
  }
  const [routes, middlewares, plugins] = await Promise.all([scanFiles('routes'), scanFiles('middleware'), scanFiles('plugins')])

  // 优先记载插件
  const resolvePlugins = async () => {
    if (plugins.length < 1) {
      return
    }
    for (const plugin of plugins) {
      const fullPath = pathe.resolve(baseDir, 'plugins', plugin)
      const relativePath = pathe.relative(baseDir, fullPath)
      const mod = await import(`./${relativePath}`)
      if (mod.default) {
        app.use(mod.default)
      }
    }
  }
  await resolvePlugins()

  // 处理路由和插件
  const resolverMiddlewares = async () => {
  // 处理插件
    for (const middleware of middlewares) {
      // 获取相对的路径
      const fullPath = pathe.resolve(baseDir, 'middleware', middleware)
      const relativePath = pathe.relative(baseDir, fullPath)
      const mod = await import(`./${relativePath}`)
      if (mod.default) {
        app.use(mod.default)
      }
    }
  }

  await resolverMiddlewares()

  // 处理路由
  const resolverRoutes = async () => {
    for (const route of routes) {
      const fullPath = pathe.resolve(baseDir, 'routes', route)
      const relativePath = pathe.relative(baseDir, fullPath)
      const mod = await import(`./${relativePath}`)
      if (mod.default) {
        const baseDir = pathe.dirname(route)
        const baseName = pathe.basename(route)
        // 去掉末尾的 .mjs
        const cleanPath = baseName.split('.')[0]
        // 处理路由的信息
        const routePath = generateRoutePath(cleanPath, baseDir, prefix)
        const method = getMethod(route)
        app.on(method as any, routePath, mod.default)
      }
    }
  }

  await resolverRoutes()

  // 过滤所有的插件信息
  serve(app, {

  })
}

createSever().then(() => {
  // TODO
})

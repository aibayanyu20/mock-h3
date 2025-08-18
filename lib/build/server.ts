import type { MockH3Ctx } from '../types'
// 新增：用于创建/写入/清理构建产物
import fs from 'node:fs/promises'
// 替换 pathe 为原生 path
import path from 'node:path'
import { getOutputPath } from '../utils/tools'

export async function genServerCode(ctx: MockH3Ctx) {
  const prefix = ctx.prefix
  const h3Config = ctx.h3Config || {}

  const outDir = getOutputPath(ctx)
  // 使用原生 path 计算路径
  const runtimeDir = path.resolve(outDir, '.runtime')
  const appFullPath = path.resolve(runtimeDir, 'app.ts')

  // 将任意 JS 值序列化为可嵌入源码的字符串，且对外层模板安全
  const escapeForTemplate = (str: string) =>
    str.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

  const serializeToCode = (val: any): string => {
    if (val === undefined)
      return 'undefined'
    if (val === null)
      return 'null'
    const t = typeof val
    if (t === 'string')
      return JSON.stringify(val)
    if (t === 'number' || t === 'boolean')
      return String(val)
    if (t === 'bigint')
      return `${String(val)}n`
    if (t === 'function')
      return escapeForTemplate(val.toString())
    if (val instanceof Date)
      return `new Date(${JSON.stringify(val.toISOString())})`
    if (val instanceof RegExp)
      return val.toString()
    if (Array.isArray(val))
      return `[${val.map(serializeToCode).join(', ')}]`
    if (val instanceof Map) {
      const entries = Array.from(val.entries()).map(([k, v]) => `[${serializeToCode(k)}, ${serializeToCode(v)}]`)
      return `new Map([${entries.join(', ')}])`
    }
    if (val instanceof Set) {
      const items = Array.from(val.values()).map(serializeToCode)
      return `new Set([${items.join(', ')}])`
    }
    if (t === 'object') {
      const props = Object.keys(val).map((k) => {
        const key = /^[A-Z_$][\w$]*$/i.test(k) ? k : JSON.stringify(k)
        return `${key}: ${serializeToCode(val[k])}`
      })
      return `{ ${props.join(', ')} }`
    }
    return JSON.stringify(val)
  }

  const configCode = serializeToCode(h3Config)

  const code = `import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { H3, serve, serveStatic } from 'h3'
import path from 'node:path'

function generateRoutePath(basePath: string, mockPath: string, baseUrl: string) {
  if (mockPath === '.')
    mockPath = ''

  if (basePath === 'index')
    basePath = ''

  // 使用 posix 保证 URL 路径正斜杠
  let p = path.posix.join(baseUrl, mockPath, basePath)
  if (p.endsWith('/')) {
    p = p.slice(0, -1)
  }
  return p
}

const validMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']

function getMethod(filePath: string) {
  const fileName = path.basename(filePath)
  const paths = fileName.split('.')
  const method = paths[0]
  if (validMethods.includes(method)) {
    return method
  }
  return 'get'
}

// 新增：统一转 POSIX 分隔符
function toPosix(p: string) {
  return p.split(path.sep).join('/')
}

// 使用原生 fs 递归扫描 **/*.mjs
async function readDirRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const tasks = entries.map(async (ent) => {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      return await readDirRecursive(full)
    }
    return full.endsWith('.mjs') ? [full] : []
  })
  const nested = await Promise.all(tasks)
  return nested.flat()
}

async function createSever() {
  const app = new H3(${configCode})
  const baseDir = path.dirname(fileURLToPath(import.meta.url))

  const prefix = ${JSON.stringify(prefix)}

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
      if (!/\\.[a-z0-9]+$/i.test(id)) {
        return path.join(baseDir, '../', 'index.html')
      }
      return path.join(baseDir, '../', id)
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

  // 定义扫描函数（替换 tinyglobby.glob）
  const scanFiles = async (dir: string) => {
    const cwd = path.resolve(baseDir, dir)
    const files = await readDirRecursive(cwd)
    // 返回相对路径，保持与原逻辑一致
    return files.map(f => path.relative(cwd, f))
  }
  const [routes, middlewares, plugins] = await Promise.all([scanFiles('routes'), scanFiles('middleware'), scanFiles('plugins')])

  // 优先加载插件
  const resolvePlugins = async () => {
    if (plugins.length < 1) return
    for (const plugin of plugins) {
      const fullPath = path.resolve(baseDir, 'plugins', plugin)
      const relativePath = path.relative(baseDir, fullPath)
      const mod = await import('./' + toPosix(relativePath))
      if (mod.default) {
        const plugin = mod.default
        if (typeof plugin === 'function') {
          app.register(plugin())
        }
        else {
          app.register(plugin)
        }
      }
    }
  }
  await resolvePlugins()

  // 处理中间件
  const resolverMiddlewares = async () => {
    for (const middleware of middlewares) {
      const fullPath = path.resolve(baseDir, 'middleware', middleware)
      const relativePath = path.relative(baseDir, fullPath)
      const mod = await import('./' + toPosix(relativePath))
      if (mod.default) {
        app.use(mod.default)
      }
    }
  }

  await resolverMiddlewares()

  // 处理路由
  const resolverRoutes = async () => {
    for (const route of routes) {
      const fullPath = path.resolve(baseDir, 'routes', route)
      const relativePath = path.relative(baseDir, fullPath)
      const mod = await import('./' + toPosix(relativePath))
      if (mod.default) {
        const dir = toPosix(path.dirname(route))
        const baseName = path.basename(route)
        const cleanPath = baseName.split('.')[0]
        const routePath = generateRoutePath(cleanPath, dir, prefix)
        const method = getMethod(route)
        app.on(method, routePath, mod.default)
      } else {
        // 未找到的路由信息，这里可以给一个提示信息
        app.on("get", routePath , () => {
          return "Please check the route configuration."
        })
      }
    }
  }

  await resolverRoutes()

  // 过滤所有的插件信息
  serve(app, {})
}

createSever().then(() => {
  // TODO
})
`
  // 新增：创建构建时目录并写入代码
  await fs.mkdir(runtimeDir, { recursive: true })
  await fs.writeFile(appFullPath, code, 'utf-8')

  // 将文件写入到这个文件夹
  return {
    appPath: appFullPath,
    // 处理完成后要清理掉文件
    clean: async () => {
      // 递归删除 .runtime 目录
      try {
        await fs.rm(runtimeDir, { recursive: true, force: true })
      } catch {
        // 忽略清理异常
      }
    },
  }
}

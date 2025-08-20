import type { MockH3Ctx } from '../types'
// 新增：用于创建/写入/清理构建产物
import fs from 'node:fs/promises'
// 替换 pathe 为原生 path
import path from 'node:path'
import { getBasePath } from '../utils/tools'

export async function genServerCode(ctx: MockH3Ctx) {
  const prefix = ctx.prefix
  const h3Config = ctx.h3Config || {}

  const outDir = getBasePath(ctx)
  // 使用原生 path 计算路径
  const runtimeDir = path.resolve(outDir, '.runtime')
  const appFullPath = path.resolve(runtimeDir, 'app.ts')

  // 处理项目问题
  const buildOptions = typeof ctx.build === 'object' ? ctx.build : {}

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
import { vendorMap } from './vendor'  // 从 vendor 加载一切

function resolvePath(path, options = {}) {
  // 处理空字符串和仅包含空格的字符串
  if (!path || !path.trim()) {
    return ''
  }

  // 路径规范化 - 移除多余的斜杠和清理路径
  let normalizedPath = path.replace(/\\\\+/g, '/').trim()
  
  // 移除末尾的斜杠（除非是根路径）
  if (normalizedPath.endsWith('/') && normalizedPath !== '/') {
    normalizedPath = normalizedPath.slice(0, -1)
  }
  
  if (!normalizedPath) {
    return ''
  }

  const paths = normalizedPath.split('/')
  const newPaths = []
  
  for (const _path of paths) {
    if (_path.startsWith('[') && _path.endsWith(']')) {
      const _name = _path.slice(1, -1)
      
      // 处理可选参数 [[param]]
      if (_name.startsWith('[') && _name.endsWith(']')) {
        const optionalParam = _name.slice(1, -1)
        
        // 处理可选的 catch-all 参数 [[...param]]
        if (optionalParam.startsWith('...')) {
          const catchAllParam = optionalParam.slice(3)
          if (catchAllParam.includes(':')) {
            const [param, type] = catchAllParam.split(':')
            newPaths.push('**:' + param + '(' + getTypeRegex(type) + ')?')
          } else {
            newPaths.push('**:' + catchAllParam + '?')
          }
          continue
        }
        
        if (optionalParam.includes(':')) {
          const [param, type] = optionalParam.split(':')
          newPaths.push(':' + param + '(' + getTypeRegex(type) + ')?')
        } else {
          newPaths.push(':' + optionalParam + '?')
        }
        continue
      }
      
      // 处理类型化参数 [param:type]
      if (_name.includes(':')) {
        const colonIndex = _name.indexOf(':')
        const param = _name.substring(0, colonIndex)
        const type = _name.substring(colonIndex + 1)
        
        if (param.startsWith('...')) {
          // 带类型的 catch-all 参数
          const catchAllParam = param.slice(3)
          newPaths.push('**:' + catchAllParam + '(' + getTypeRegex(type) + ')')
        } else {
          // 普通类型化参数
          newPaths.push(':' + param + '(' + getTypeRegex(type) + ')')
        }
        continue
      }
      
      // 原有的逻辑保持不变
      if (_name === 'all' || _name === '...') {
        newPaths.push('*')
      } else if (_name === '...all') {
        newPaths.push('**')
      } else if (_name.startsWith('...')) {
        // 如果是出现...就进行替换
        newPaths.push('**:' + _name.slice(3))
      } else {
        newPaths.push(':' + _name)
      }
    } else {
      // 处理静态路径段的特殊字符
      if (options.strict && _path.includes('*')) {
        throw new Error('Invalid path segment: ' + _path + '. Wildcard characters not allowed in static segments when strict mode is enabled.')
      }
      newPaths.push(_path)
    }
  }
  
  const result = newPaths.join('/')
  
  // 验证结果路径的有效性
  if (options.strict) {
    validateResolvedPath(result)
  }
  
  return result
}

// 获取类型对应的正则表达式
function getTypeRegex(type) {
  const typeRegexMap = {
    'number': '\\\\\\\\d+',
    'int': '\\\\\\\\d+',
    'float': '\\\\\\\\d+\\\\\\\\.\\\\\\\\d+',
    'uuid': '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
    'slug': '[a-z0-9-]+',
    'alpha': '[a-zA-Z]+',
    'alphanumeric': '[a-zA-Z0-9]+',
    'email': '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\\\\\.[a-zA-Z]{2,}',
    'date': '\\\\\\\\d{4}-\\\\\\\\d{2}-\\\\\\\\d{2}',
    'year': '\\\\\\\\d{4}',
    'month': '\\\\\\\\d{1,2}',
    'day': '\\\\\\\\d{1,2}',
  }
  
  return typeRegexMap[type] || type // 如果不是预定义类型，则作为自定义正则表达式
}

// 验证解析后的路径
function validateResolvedPath(path) {
  // 检查是否有无效的参数组合
  if (path.includes('**:') && path.includes('*')) {
    const segments = path.split('/')
    const wildcardIndex = segments.findIndex(function(seg) { return seg === '*' })
    const catchAllIndex = segments.findIndex(function(seg) { return seg.startsWith('**:') })
    
    if (wildcardIndex >= 0 && catchAllIndex >= 0 && wildcardIndex > catchAllIndex) {
      throw new Error('Invalid path: wildcard (*) cannot appear after catch-all (**:param)')
    }
  }
  
  // 检查多个 catch-all 参数
  const catchAllCount = (path.match(/\\\\\\\\*\\\\\\\\*:/g) || []).length
  if (catchAllCount > 1) {
    throw new Error('Invalid path: multiple catch-all parameters are not allowed')
  }
  
  // 检查 catch-all 参数是否在最后
  if (catchAllCount === 1) {
    const lastSegment = path.split('/').pop()
    if (lastSegment && !lastSegment.startsWith('**:')) {
      throw new Error('Invalid path: catch-all parameter must be the last segment')
    }
  }
}

function generateRoutePath(basePath, mockPath, baseUrl) {
  if (mockPath === '.')
    mockPath = ''

  if (basePath === 'index')
    basePath = ''

  // 使用 posix 保证 URL 路径正斜杠
  let p = path.posix.join(baseUrl, mockPath, basePath)
  if (p.endsWith('/')) {
    p = p.slice(0, -1)
  }
  // 最后再对path进行一次处理
  return resolvePath(p)
}

const validMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']

function getMethod(filePath) {
  const fileName = path.basename(filePath)
  const paths = fileName.split('.')
  const method = paths[1]
  if (validMethods.includes(method)) {
    return method
  }
  return 'get'
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
        const filePath = getFilePath(id);
        const ext = path.extname(filePath).toLowerCase();
        const TEXT_EXTS = [
            ".html", ".htm",
            ".js", ".mjs", ".ts",
            ".css", ".json", ".map",
            ".txt", ".md", ".vue",
            ".xml", ".svg"
        ];
        // 文本文件按 utf-8 读
        if (TEXT_EXTS.includes(ext)) {
          return fs.readFile(filePath, "utf-8");
        }
        return fs.readFile(getFilePath(id))
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

  // 基于 vendorMap 分类收集
  const collectByPrefix = (pfx) => Object.keys(vendorMap).filter(k => k.startsWith(pfx))
  const plugins = collectByPrefix('plugins/')
  const middlewares = collectByPrefix('middleware/')
  const routes = collectByPrefix('routes/')

  // 优先加载插件（兼容 default 与非 default）
  const resolvePlugins = async () => {
    for (const key of plugins) {
      const mod = vendorMap[key]
      const plugin = mod && mod.default ? mod.default : mod
      if (!plugin) continue
      if (typeof plugin === 'function') {
        app.register(plugin())
      } else {
        app.register(plugin)
      }
    }
  }
  await resolvePlugins()

  // 处理中间件（兼容 default 与非 default）
  const resolverMiddlewares = async () => {
    for (const key of middlewares) {
      const mod = vendorMap[key]
      const mw = mod && mod.default ? mod.default : mod
      if (!mw) continue
      app.use(mw)
    }
  }
  await resolverMiddlewares()

  // 处理路由：从 routes/* 的 key 生成 method 与 path
  const resolverRoutes = async () => {
    for (const key of routes) {
      // 去掉 routes/ 前缀，作为“虚拟文件路径”
      const rel = key.slice('routes/'.length)

      // 使用 posix 以确保 URL 路径分隔符
      const dir = path.posix.dirname(rel)
      const baseName = path.posix.basename(rel)
      const cleanPath = baseName.split('.')[0]

      const routePath = generateRoutePath(
        cleanPath,
        dir === '.' ? '' : dir,
        prefix
      )
      const method = getMethod(baseName)

      const mod = vendorMap[key]
      const handler = mod && mod.default ? mod.default : mod
      if (!handler) continue
      app.on(method, routePath, handler)
    }
  }
  await resolverRoutes()

  // 启动服务
  serve(app, {
    port: ${buildOptions.port || 3000},
    host: ${JSON.stringify(buildOptions.host || 'localhost')},
  })
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

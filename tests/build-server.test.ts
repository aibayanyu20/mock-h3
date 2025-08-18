import type { MockH3Ctx } from '../lib/types'
import { describe, expect, it } from 'vitest'
import { genServerCode } from '../lib/build/server'

describe('build server integration', () => {
  const createMockCtx = (overrides?: Partial<MockH3Ctx>): MockH3Ctx => ({
    prefix: '/api',
    srcDir: 'servers',
    outputDir: 'dist/servers',
    h3Config: {},
    build: {
      port: 3000,
      host: 'localhost',
    },
    ...overrides,
  } as MockH3Ctx)

  describe('genServerCode', () => {
    it('should generate server code with resolvePath integration', async () => {
      const ctx = createMockCtx()
      const result = await genServerCode(ctx)

      expect(result).toHaveProperty('appPath')
      expect(result).toHaveProperty('clean')
      expect(typeof result.clean).toBe('function')
    })

    it('should include resolvePath function in generated code', async () => {
      const ctx = createMockCtx()
      const result = await genServerCode(ctx)

      // 读取生成的代码内容
      const fs = await import('node:fs/promises')
      const generatedCode = await fs.readFile(result.appPath, 'utf-8')

      // 验证 resolvePath 函数存在
      expect(generatedCode).toContain('function resolvePath(path, options = {})')
      expect(generatedCode).toContain('function getTypeRegex(type)')
      expect(generatedCode).toContain('function validateResolvedPath(path)')

      // 验证类型映射存在
      expect(generatedCode).toContain('\'number\': \'\\\\\\\\d+\'')
      expect(generatedCode).toContain('\'slug\': \'[a-z0-9-]+\'')
      expect(generatedCode).toContain('\'uuid\': \'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\'')

      // 验证 generateRoutePath 调用 resolvePath
      expect(generatedCode).toContain('return resolvePath(p)')

      // 清理生成的文件
      await result.clean()
    })

    it('should handle different prefix configurations', async () => {
      const ctx = createMockCtx({ prefix: '/v1/api' })
      const result = await genServerCode(ctx)

      const fs = await import('node:fs/promises')
      const generatedCode = await fs.readFile(result.appPath, 'utf-8')

      expect(generatedCode).toContain('const prefix = "/v1/api"')

      await result.clean()
    })

    it('should handle custom h3 config', async () => {
      const ctx = createMockCtx({
        h3Config: {
          debug: true,
        },
      })
      const result = await genServerCode(ctx)

      const fs = await import('node:fs/promises')
      const generatedCode = await fs.readFile(result.appPath, 'utf-8')

      expect(generatedCode).toContain('debug: true')

      await result.clean()
    })

    it('should handle custom build options', async () => {
      const ctx = createMockCtx({
        build: {
          port: 8080,
          host: '0.0.0.0',
        },
      })
      const result = await genServerCode(ctx)

      const fs = await import('node:fs/promises')
      const generatedCode = await fs.readFile(result.appPath, 'utf-8')

      expect(generatedCode).toContain('port: 8080')
      expect(generatedCode).toContain('host: "0.0.0.0"')

      await result.clean()
    })
  })

  describe('generated server functionality', () => {
    it('should properly resolve dynamic routes in generated code', async () => {
      const ctx = createMockCtx()
      const result = await genServerCode(ctx)

      const fs = await import('node:fs/promises')
      const generatedCode = await fs.readFile(result.appPath, 'utf-8')

      // 验证生成的代码包含所有必要的路径解析功能
      const expectedFeatures = [
        // 基础功能
        'function resolvePath(path, options = {})',
        'function getTypeRegex(type)',
        'function generateRoutePath(basePath, mockPath, baseUrl)',

        // 类型支持
        '\'number\': \'\\\\\\\\d+\'',
        '\'uuid\': \'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\'',
        '\'slug\': \'[a-z0-9-]+\'',
        '\'email\': \'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\\\\\.[a-zA-Z]{2,}\'',

        // 路径处理逻辑
        'if (_name === \'all\' || _name === \'...\') {',
        'newPaths.push(\'*\')',
        'else if (_name === \'...all\') {',
        'newPaths.push(\'**\')',
        'if (param.startsWith(\'...\')) {',

        // 验证功能
        'function validateResolvedPath(path)',
        'Invalid path: multiple catch-all parameters are not allowed',
        'Invalid path: catch-all parameter must be the last segment',
      ]

      for (const feature of expectedFeatures) {
        expect(generatedCode).toContain(feature)
      }

      await result.clean()
    })

    it('should include proper error handling', async () => {
      const ctx = createMockCtx()
      const result = await genServerCode(ctx)

      const fs = await import('node:fs/promises')
      const generatedCode = await fs.readFile(result.appPath, 'utf-8')

      // 验证错误处理
      expect(generatedCode).toContain('Wildcard characters not allowed in static segments when strict mode is enabled')
      expect(generatedCode).toContain('Invalid path: wildcard (*) cannot appear after catch-all (**:param)')
      expect(generatedCode).toContain('Invalid path: multiple catch-all parameters are not allowed')
      expect(generatedCode).toContain('Invalid path: catch-all parameter must be the last segment')

      await result.clean()
    })
  })

  describe('path resolution integration', () => {
    it('should correctly integrate resolvePath with generateRoutePath', async () => {
      const ctx = createMockCtx()
      const result = await genServerCode(ctx)

      const fs = await import('node:fs/promises')
      const generatedCode = await fs.readFile(result.appPath, 'utf-8')

      // 验证 generateRoutePath 函数调用 resolvePath
      expect(generatedCode).toMatch(/function generateRoutePath\(basePath, mockPath, baseUrl\) \{[\s\S]*return resolvePath\(p\)[\s\S]*\}/)

      await result.clean()
    })

    it('should preserve all original functionality while adding new features', async () => {
      const ctx = createMockCtx()
      const result = await genServerCode(ctx)

      const fs = await import('node:fs/promises')
      const generatedCode = await fs.readFile(result.appPath, 'utf-8')

      // 验证原有功能保留
      expect(generatedCode).toContain('function getMethod(filePath)')
      expect(generatedCode).toContain('function toPosix(p)')
      expect(generatedCode).toContain('async function readDirRecursive(dir)')
      expect(generatedCode).toContain('const validMethods = [\'get\', \'post\', \'put\', \'delete\', \'patch\', \'head\', \'options\']')

      // 验证新增功能
      expect(generatedCode).toContain('function resolvePath(path, options = {})')
      expect(generatedCode).toContain('function getTypeRegex(type)')
      expect(generatedCode).toContain('function validateResolvedPath(path)')

      await result.clean()
    })
  })
})

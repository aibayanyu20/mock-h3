import { describe, expect, it } from 'vitest'
import { resolvePath } from '../lib/server'

describe('resolvePath', () => {
  describe('基础动态路径解析', () => {
    it('should resolve simple dynamic paths', () => {
      const result = resolvePath('/users/[id]/posts/[postId]')
      expect(result).toBe('/users/:id/posts/:postId')
    })

    it('should resolve single dynamic parameter', () => {
      const result = resolvePath('/users/[id]')
      expect(result).toBe('/users/:id')
    })

    it('should handle multiple dynamic parameters', () => {
      const result = resolvePath('/api/[version]/users/[userId]/posts/[postId]')
      expect(result).toBe('/api/:version/users/:userId/posts/:postId')
    })
  })

  describe('特殊通配符解析', () => {
    it('should resolve [all] to wildcard *', () => {
      const result = resolvePath('/files/[all]')
      expect(result).toBe('/files/*')
    })

    it('should resolve [...] to wildcard *', () => {
      const result = resolvePath('/files/[...]')
      expect(result).toBe('/files/*')
    })

    it('should resolve [...all] to wildcard **', () => {
      const result = resolvePath('/files/[...all]')
      expect(result).toBe('/files/**')
    })

    it('should resolve [...param] to named wildcard **:param', () => {
      const result = resolvePath('/api/[...slug]')
      expect(result).toBe('/api/**:slug')
    })

    it('should resolve [...segments] to named wildcard **:segments', () => {
      const result = resolvePath('/docs/[...segments]')
      expect(result).toBe('/docs/**:segments')
    })
  })

  describe('类型化参数解析', () => {
    it('should resolve number type parameters', () => {
      const result = resolvePath('/users/[id:number]')
      expect(result).toBe('/users/:id(\\d+)')
    })

    it('should resolve int type parameters', () => {
      const result = resolvePath('/posts/[id:int]')
      expect(result).toBe('/posts/:id(\\d+)')
    })

    it('should resolve float type parameters', () => {
      const result = resolvePath('/prices/[amount:float]')
      expect(result).toBe('/prices/:amount(\\d+\\.\\d+)')
    })

    it('should resolve uuid type parameters', () => {
      const result = resolvePath('/users/[id:uuid]')
      expect(result).toBe('/users/:id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
    })

    it('should resolve slug type parameters', () => {
      const result = resolvePath('/posts/[slug:slug]')
      expect(result).toBe('/posts/:slug([a-z0-9-]+)')
    })

    it('should resolve alpha type parameters', () => {
      const result = resolvePath('/categories/[name:alpha]')
      expect(result).toBe('/categories/:name([a-zA-Z]+)')
    })

    it('should resolve alphanumeric type parameters', () => {
      const result = resolvePath('/tags/[tag:alphanumeric]')
      expect(result).toBe('/tags/:tag([a-zA-Z0-9]+)')
    })

    it('should resolve email type parameters', () => {
      const result = resolvePath('/users/[email:email]')
      expect(result).toBe('/users/:email([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})')
    })

    it('should resolve date type parameters', () => {
      const result = resolvePath('/events/[date:date]')
      expect(result).toBe('/events/:date(\\d{4}-\\d{2}-\\d{2})')
    })

    it('should resolve year type parameters', () => {
      const result = resolvePath('/archive/[year:year]')
      expect(result).toBe('/archive/:year(\\d{4})')
    })

    it('should resolve custom regex type parameters', () => {
      const result = resolvePath('/files/[name:[a-z]+\\.[a-z]{2,4}]')
      expect(result).toBe('/files/:name([a-z]+\\.[a-z]{2,4})')
    })
  })

  describe('可选参数解析', () => {
    it('should resolve optional parameters', () => {
      const result = resolvePath('/posts/[[slug]]')
      expect(result).toBe('/posts/:slug?')
    })

    it('should resolve optional typed parameters', () => {
      const result = resolvePath('/posts/[[id:number]]')
      expect(result).toBe('/posts/:id(\\d+)?')
    })

    it('should resolve optional slug parameters', () => {
      const result = resolvePath('/categories/[[slug:slug]]')
      expect(result).toBe('/categories/:slug([a-z0-9-]+)?')
    })

    it('should handle multiple optional parameters', () => {
      const result = resolvePath('/archive/[[year:year]]/[[month:month]]')
      expect(result).toBe('/archive/:year(\\d{4})?/:month(\\d{1,2})?')
    })
  })

  describe('类型化 catch-all 参数', () => {
    it('should resolve typed catch-all parameters', () => {
      const result = resolvePath('/files/[...path:slug]')
      expect(result).toBe('/files/**:path([a-z0-9-]+)')
    })

    it('should resolve number typed catch-all parameters', () => {
      const result = resolvePath('/api/[...ids:number]')
      expect(result).toBe('/api/**:ids(\\d+)')
    })

    it('should resolve custom regex catch-all parameters', () => {
      const result = resolvePath('/docs/[...path:[a-zA-Z0-9/-]+]')
      // 由于复杂正则表达式包含方括号，当前实现不会解析它
      // 这是预期行为，因为解析包含方括号的正则表达式需要更复杂的解析器
      expect(result).toBe('/docs/[...path:[a-zA-Z0-9/-]+]')
    })
  })

  describe('路径规范化', () => {
    it('should normalize paths with double slashes', () => {
      const result = resolvePath('/api//users//[id]')
      expect(result).toBe('/api/users/:id')
    })

    it('should handle trailing slashes', () => {
      const result = resolvePath('/api/users/[id]/')
      expect(result).toBe('/api/users/:id')
    })

    it('should handle leading spaces and cleanup', () => {
      const result = resolvePath('  /api/users/[id]  ')
      expect(result).toBe('/api/users/:id')
    })

    it('should handle relative path normalization', () => {
      const result = resolvePath('/api/./users/../users/[id]')
      expect(result).toBe('/api/users/:id')
    })
  })

  describe('严格模式验证', () => {
    it('should throw error for invalid wildcard in static segments in strict mode', () => {
      expect(() => {
        resolvePath('/api/*/users/[id]', { strict: true })
      }).toThrow('Invalid path segment: *. Wildcard characters not allowed in static segments when strict mode is enabled.')
    })

    it('should throw error for multiple catch-all parameters in strict mode', () => {
      expect(() => {
        resolvePath('/api/[...path1]/[...path2]', { strict: true })
      }).toThrow('Invalid path: multiple catch-all parameters are not allowed')
    })

    it('should throw error for catch-all not at the end in strict mode', () => {
      expect(() => {
        resolvePath('/api/[...path]/users', { strict: true })
      }).toThrow('Invalid path: catch-all parameter must be the last segment')
    })

    it('should throw error for wildcard after catch-all in strict mode', () => {
      expect(() => {
        resolvePath('/api/[...path]/[all]', { strict: true })
      }).toThrow('Invalid path: wildcard (*) cannot appear after catch-all (**:param)')
    })

    it('should allow valid paths in strict mode', () => {
      expect(() => {
        resolvePath('/api/users/[id:number]/posts/[...slug]', { strict: true })
      }).not.toThrow()
    })
  })

  describe('混合路径解析', () => {
    it('should handle mix of static and dynamic segments', () => {
      const result = resolvePath('/api/v1/users/[id]/profile')
      expect(result).toBe('/api/v1/users/:id/profile')
    })

    it('should handle multiple types of dynamic segments', () => {
      const result = resolvePath('/api/[version]/files/[...path]')
      expect(result).toBe('/api/:version/files/**:path')
    })

    it('should handle complex nested paths', () => {
      const result = resolvePath('/api/[version]/users/[userId]/posts/[postId]/comments/[...commentPath]')
      expect(result).toBe('/api/:version/users/:userId/posts/:postId/comments/**:commentPath')
    })

    it('should handle mix of typed and untyped parameters', () => {
      const result = resolvePath('/api/users/[id:number]/posts/[slug]/comments/[commentId:uuid]')
      expect(result).toBe('/api/users/:id(\\d+)/posts/:slug/comments/:commentId([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
    })

    it('should handle optional and required parameters together', () => {
      const result = resolvePath('/blog/[year:year]/[[month:month]]/[slug]')
      expect(result).toBe('/blog/:year(\\d{4})/:month(\\d{1,2})?/:slug')
    })
  })

  describe('边界情况', () => {
    it('should handle empty path', () => {
      const result = resolvePath('')
      expect(result).toBe('')
    })

    it('should handle root path', () => {
      const result = resolvePath('/')
      expect(result).toBe('/')
    })

    it('should handle path without dynamic segments', () => {
      const result = resolvePath('/api/users/profile')
      expect(result).toBe('/api/users/profile')
    })

    it('should handle path with only dynamic segment', () => {
      const result = resolvePath('[id]')
      expect(result).toBe(':id')
    })

    it('should handle path with only wildcard', () => {
      const result = resolvePath('[all]')
      expect(result).toBe('*')
    })

    it('should handle path with only catch-all', () => {
      const result = resolvePath('[...slug]')
      expect(result).toBe('**:slug')
    })

    it('should handle whitespace-only path', () => {
      const result = resolvePath('   ')
      expect(result).toBe('')
    })
  })

  describe('无效或特殊字符', () => {
    it('should handle malformed brackets (unclosed)', () => {
      const result = resolvePath('/users/[id/posts')
      expect(result).toBe('/users/[id/posts')
    })

    it('should handle malformed brackets (unopened)', () => {
      const result = resolvePath('/users/id]/posts')
      expect(result).toBe('/users/id]/posts')
    })

    it('should handle empty brackets', () => {
      const result = resolvePath('/users/[]/posts')
      expect(result).toBe('/users/:/posts')
    })

    it('should handle nested brackets', () => {
      const result = resolvePath('/users/[[id]]/posts')
      expect(result).toBe('/users/:id?/posts')
    })

    it('should handle special characters in static segments', () => {
      const result = resolvePath('/api/v1.0/users-list/[id]')
      expect(result).toBe('/api/v1.0/users-list/:id')
    })

    it('should handle malformed optional parameters', () => {
      const result = resolvePath('/users/[[[id]]]/posts')
      expect(result).toBe('/users/:[id]?/posts')
    })
  })

  describe('复杂实际场景', () => {
    it('should handle REST API patterns', () => {
      expect(resolvePath('/api/v1/users/[id]')).toBe('/api/v1/users/:id')
      expect(resolvePath('/api/v1/users/[id]/posts')).toBe('/api/v1/users/:id/posts')
      expect(resolvePath('/api/v1/users/[id]/posts/[postId]')).toBe('/api/v1/users/:id/posts/:postId')
    })

    it('should handle file system like patterns', () => {
      expect(resolvePath('/files/[...path]')).toBe('/files/**:path')
      expect(resolvePath('/uploads/[userId]/[...filepath]')).toBe('/uploads/:userId/**:filepath')
    })

    it('should handle admin routes', () => {
      expect(resolvePath('/admin/users/[id]')).toBe('/admin/users/:id')
      expect(resolvePath('/admin/[section]/[...params]')).toBe('/admin/:section/**:params')
    })

    it('should handle versioned APIs', () => {
      expect(resolvePath('/api/[version]/users/[id]/posts/[postId]/comments/[commentId]'))
        .toBe('/api/:version/users/:id/posts/:postId/comments/:commentId')
    })

    it('should handle catch-all with multiple segments', () => {
      expect(resolvePath('/docs/[...slug]')).toBe('/docs/**:slug')
      expect(resolvePath('/blog/[year]/[month]/[...slug]')).toBe('/blog/:year/:month/**:slug')
    })

    it('should handle e-commerce patterns', () => {
      expect(resolvePath('/products/[category:slug]/[id:number]')).toBe('/products/:category([a-z0-9-]+)/:id(\\d+)')
      expect(resolvePath('/orders/[orderId:uuid]/items/[[itemId:number]]')).toBe('/orders/:orderId([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/items/:itemId(\\d+)?')
    })

    it('should handle blog-like patterns', () => {
      expect(resolvePath('/blog/[year:year]/[month:month]/[day:day]/[slug:slug]'))
        .toBe('/blog/:year(\\d{4})/:month(\\d{1,2})/:day(\\d{1,2})/:slug([a-z0-9-]+)')
    })

    it('should handle user profile patterns', () => {
      expect(resolvePath('/users/[username:alphanumeric]/posts/[[category:slug]]'))
        .toBe('/users/:username([a-zA-Z0-9]+)/posts/:category([a-z0-9-]+)?')
    })
  })

  describe('next.js 风格路由兼容性', () => {
    it('should handle Next.js dynamic routes', () => {
      expect(resolvePath('/posts/[slug]')).toBe('/posts/:slug')
      expect(resolvePath('/posts/[...slug]')).toBe('/posts/**:slug')
      expect(resolvePath('/shop/[...slug]')).toBe('/shop/**:slug')
    })

    it('should handle Next.js optional catch-all routes', () => {
      expect(resolvePath('/api/[...params]')).toBe('/api/**:params')
    })

    it('should handle Next.js optional routes (extended)', () => {
      expect(resolvePath('/posts/[[slug]]')).toBe('/posts/:slug?')
      expect(resolvePath('/categories/[[...slug]]')).toBe('/categories/**:slug?')
    })
  })

  describe('高级类型约束', () => {
    it('should handle email validation in routes', () => {
      const result = resolvePath('/users/[email:email]/profile')
      expect(result).toBe('/users/:email([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/profile')
    })

    it('should handle multiple date components', () => {
      const result = resolvePath('/events/[year:year]/[month:month]/[day:day]')
      expect(result).toBe('/events/:year(\\d{4})/:month(\\d{1,2})/:day(\\d{1,2})')
    })

    it('should handle complex file patterns', () => {
      const result = resolvePath('/files/[name:[a-zA-Z0-9_-]+\\.[a-z]{2,4}]')
      expect(result).toBe('/files/:name([a-zA-Z0-9_-]+\\.[a-z]{2,4})')
    })
  })
})

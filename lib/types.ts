import type { H3, H3Config } from 'h3'
import type { Options } from 'tsdown'
import type { Options as TsupOptions } from 'tsup'
import type { createLogger, PreviewServer, ResolvedConfig, ViteDevServer } from 'vite'

export interface MockH3Options {
  /**
   * 定义server的根目录
   * @default "servers"
   */
  srcDir?: string
  /**
   * 输出目录
   * @default "dist/servers"
   */
  outputDir?: string
  /**
   * 是否需要构建时打包
   * @default true
   */
  build?: boolean | {
    /**
     * 配置启动的端口号
     * @default 3000
     */
    port?: number

    /**
     * 配置默认的host
     * @default localhost
     */
    host?: string
  }
  /**
   * 构建打包所需要的参数
   */
  tsdownOptions?: Options
  /**
   * tsup的构建选项
   */
  tsupOptions?: TsupOptions
  /**
   * 自定义请求的前缀
   * @default "/api"
   */
  prefix?: string
  /**
   * 定义H3的Config
   */
  h3Config?: H3Config
  /**
   * build的方式
   * @default "tsdown"
   */
  builder?: 'tsdown' | 'tsup'
}

export interface MockH3Ctx extends Required<MockH3Options> {
  logger: ReturnType<typeof createLogger>
  /**
   * Vite的配置
   */
  resolveConfig?: ResolvedConfig
  /**
   * 记录已经被注册的路由信息
   */
  registeredRoutes: Set<string>
  /**
   * Vite的开发服务器和运行时的服务器
   */
  server?: ViteDevServer | PreviewServer
  /**
   * 标记当前的服务器状态
   * @default false
   */
  isPreviewSever?: boolean
  /**
   * 实现H3的实例的部分
   */
  h3?: H3
}

export type Method = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options'

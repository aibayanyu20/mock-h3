import type { MockH3Ctx } from '../types'
import pathe from 'pathe'
import { glob } from 'tinyglobby'
import { build } from 'tsdown'
import { getBasePath, getOutputPath } from '../utils/tools'
import { genServerCode } from './server'

export async function createBuild(ctx: MockH3Ctx) {
  const basePath = getBasePath(ctx)
  const { appPath: mainCodePath, clean } = await genServerCode(ctx)
  // 扫描这个目录下面的所有的文件，然后进行构建
  const files = await glob(
    '**/*.{js,ts}',
    {
      cwd: basePath,
      ignore: [
        '**/*.spec.{js,ts}',
        '**/*.test.{js,ts}',
        '**/*.d.{js,ts}',
      ],
    },
  )
  // 创建输出的目录
  const outputDir = getOutputPath(ctx)

  const entry: Record<string, string> = {}
  for (const rel of files) {
    const abs = pathe.resolve(basePath, rel)
    const name = rel.replace(/\.(ts|js)$/, '')
    entry[name] = abs
  }
  // 内置的 server 入口
  entry.app = mainCodePath
  // 开始构建到指定输出目录
  await build({
    entry,
    platform: 'node',
    outDir: outputDir,
    config: false,
    clean: true,
    noExternal: () => true,
    skipNodeModulesBundle: false,
    logLevel: 'silent',
    report: false,
    format: 'esm',
    outExtensions: () => {
      return {
        js: '.mjs',
      }
    },
  })
  await clean()
}

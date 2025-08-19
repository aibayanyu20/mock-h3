import type { MockH3Ctx } from '../types'
import pathe from 'pathe'
import { glob } from 'tinyglobby'
import { build } from 'tsdown'
import { getBasePath, getOutputPath } from '../utils/tools'
import { genServerCode } from './server'
import fsp from "fs/promises"

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

  const runtimeDir = pathe.resolve(outputDir,".runtime")
  const vendorFilePath = pathe.resolve(runtimeDir, 'vendor.ts')

  const entry: Record<string, string> = {}
  // 根据这里面的entry自动输出一个.ts的文件，用于处理
  let vendorTs = ''
  let index = 0
  let vendorMap = 'export const vendorMap = {\n'
  for (const rel of files) {
    const abs = pathe.resolve(basePath, rel)
    const relativePath = pathe.relative(runtimeDir, abs)
    vendorTs += `import vendor_${index} from '${relativePath}';\n`
    const name = rel.replace(/\.(ts|js)$/, '')
    entry[name] = abs
    vendorMap += `  '${name}': vendor_${index},\n`
    index++
  }

  vendorMap = `${vendorTs}${vendorMap}\n}`
  // 输出这个文件
  await fsp.writeFile(vendorFilePath, vendorMap,"utf-8")

  // 内置的 server 入口
  entry.app = mainCodePath
  // 开始构建到指定输出目录
  await build({
    entry:{
      app:mainCodePath,
      vendor:vendorFilePath
    },
    platform: 'node',
    outDir: outputDir,
    config: false,
    clean: false,
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

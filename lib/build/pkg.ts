import type { MockH3Ctx } from '../types'
import { getPackageInfo, isPackageExists } from 'local-pkg'

export async function loadPkg(ctx: MockH3Ctx) {
  const external = ctx.external || []
  const pkgJson: Record<string, any> = {
    type: 'module',
    dependencies: {},
  }
  if (external && external.length) {
    await Promise.all(external.map(async (dep) => {
      if (isPackageExists(dep)) {
        const pkgInfo = await getPackageInfo(dep)
        if (pkgInfo) {
          pkgJson.dependencies[dep] = pkgInfo.version
        }
      }
    }))
  }
  return JSON.stringify(pkgJson, null, 2)
}

import { getPackageInfo } from 'local-pkg'
import { describe, expect, it } from 'vitest'

describe('pkg', () => {
  it('should work', async () => {
    const pkgJson = await getPackageInfo('h3')
    expect(pkgJson).toBeDefined()
    console.log(pkgJson)
  })
})

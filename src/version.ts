import * as fs from 'fs'
import { compareVersion } from './locator'

export interface PackageInfo {
  version: string
  name: string
  productName: string
}

export function readPackageInfo(packageJsonPath: string): PackageInfo | null {
  if (!fs.existsSync(packageJsonPath)) return null
  try {
    const raw = fs.readFileSync(packageJsonPath, 'utf8')
    const pkg = JSON.parse(raw)
    return {
      version: String(pkg.version ?? ''),
      name: String(pkg.name ?? ''),
      productName: String(pkg.productName ?? ''),
    }
  } catch {
    return null
  }
}

export { compareVersion }

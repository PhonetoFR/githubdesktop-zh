import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

export interface AppInstall {
  version: string
  appDir: string
  indexHtml: string
  mainJs: string
  rendererJs: string
  packageJson: string
}

export interface LocateResult {
  root: string
  installs: AppInstall[]
}

export function getDesktopRoot(): string {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) {
    throw new Error('无法读取环境变量 LOCALAPPDATA，请确认在 Windows 上运行。')
  }
  return path.join(localAppData, 'GitHubDesktop')
}

export function findInstalls(root?: string): LocateResult {
  const desktopRoot = root ?? getDesktopRoot()
  if (!fs.existsSync(desktopRoot)) {
    throw new Error(`未找到 GitHub Desktop 安装目录: ${desktopRoot}`)
  }

  const installs: AppInstall[] = []
  const entries = fs.readdirSync(desktopRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const match = /^app-(.+)$/.exec(entry.name)
    if (!match) continue
    const version = match[1]
    const appDir = path.join(desktopRoot, entry.name, 'resources', 'app')
    const indexHtml = path.join(appDir, 'index.html')
    const mainJs = path.join(appDir, 'main.js')
    const rendererJs = path.join(appDir, 'renderer.js')
    const packageJson = path.join(appDir, 'package.json')
    if (fs.existsSync(indexHtml) && fs.existsSync(mainJs)) {
      installs.push({ version, appDir, indexHtml, mainJs, rendererJs, packageJson })
    }
  }

  installs.sort((a, b) => compareVersion(a.version, b.version))
  return { root: desktopRoot, installs }
}

export function getNewestInstall(installs: AppInstall[]): AppInstall | null {
  if (installs.length === 0) return null
  return installs[installs.length - 1]
}

export function findInstallByVersion(
  installs: AppInstall[],
  version: string
): AppInstall | null {
  return installs.find(i => i.version === version) ?? null
}

export function compareVersion(a: string, b: string): number {
  const pa = a.split(/[-.]/).map(s => {
    const n = Number.parseInt(s, 10)
    return Number.isFinite(n) ? n : s
  })
  const pb = b.split(/[-.]/).map(s => {
    const n = Number.parseInt(s, 10)
    return Number.isFinite(n) ? n : s
  })
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return va - vb
    } else if (typeof va === 'string' && typeof vb === 'string') {
      if (va !== vb) return va < vb ? -1 : 1
    } else {
      return typeof va === 'number' ? 1 : -1
    }
  }
  return 0
}

export function backupPath(file: string): string {
  return file + '.bak'
}

export { path, os, fs }

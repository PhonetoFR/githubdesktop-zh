import * as fs from 'fs'
import * as path from 'path'
import { AppInstall, backupPath } from './locator'
import { Dict } from './dict'
import { buildRuntime } from './runtime'
import { buildMenuPatch, PATCH_START, PATCH_END } from './menu-patch'

const RUNTIME_MARKER = 'zh/runtime.js'
const INDEX_MARKER = `<script defer="defer" src="${RUNTIME_MARKER}"></script>`
const INDEX_INSERT_AFTER = '<script defer="defer" src="renderer.js"></script>'

export type PatchState = 'none' | 'patched' | 'restored' | 'broken'

export interface InstallStatus {
  version: string
  state: PatchState
  hasBackup: boolean
  isPatched: boolean
}

export function getState(install: AppInstall): PatchState {
  const hasBackup = fs.existsSync(backupPath(install.indexHtml)) &&
    fs.existsSync(backupPath(install.mainJs))
  const isPatched = checkPatched(install)
  if (hasBackup && isPatched) return 'patched'
  if (hasBackup && !isPatched) return 'restored'
  if (!hasBackup && isPatched) return 'broken'
  return 'none'
}

export function getStatus(install: AppInstall): InstallStatus {
  const state = getState(install)
  return {
    version: install.version,
    state,
    hasBackup: fs.existsSync(backupPath(install.indexHtml)) &&
      fs.existsSync(backupPath(install.mainJs)),
    isPatched: checkPatched(install),
  }
}

function checkPatched(install: AppInstall): boolean {
  try {
    const idx = fs.readFileSync(install.indexHtml, 'utf8')
    const main = fs.readFileSync(install.mainJs, 'utf8')
    return idx.includes(RUNTIME_MARKER) && main.includes(PATCH_START)
  } catch {
    return false
  }
}

function ensureBackup(install: AppInstall): void {
  const idxBak = backupPath(install.indexHtml)
  const mainBak = backupPath(install.mainJs)
  if (!fs.existsSync(idxBak)) {
    fs.copyFileSync(install.indexHtml, idxBak)
  }
  if (!fs.existsSync(mainBak)) {
    fs.copyFileSync(install.mainJs, mainBak)
  }
}

function stripOldIndexPatch(content: string): string {
  return content.replace(
    new RegExp(
      '<script defer="defer" src="zh/runtime\\.js"></script>',
      'g'
    ),
    ''
  )
}

function stripOldMainPatch(content: string): string {
  return content.replace(
    new RegExp(
      '/\\*ZH-PATCH\\*/[\\s\\S]*?/\\*END-ZH-PATCH\\*/',
      'g'
    ),
    ''
  )
}

function writeRuntime(install: AppInstall, dict: Dict): void {
  const zhDir = path.join(install.appDir, 'zh')
  if (!fs.existsSync(zhDir)) {
    fs.mkdirSync(zhDir, { recursive: true })
  }
  const runtimePath = path.join(zhDir, 'runtime.js')
  fs.writeFileSync(runtimePath, buildRuntime(dict), 'utf8')
}

function patchIndex(install: AppInstall): void {
  let content = fs.readFileSync(install.indexHtml, 'utf8')
  content = stripOldIndexPatch(content)
  const idx = content.indexOf(INDEX_INSERT_AFTER)
  if (idx < 0) {
    throw new Error(
      `index.html 中未找到注入锚点: ${INDEX_INSERT_AFTER}`
    )
  }
  const insertPos = idx + INDEX_INSERT_AFTER.length
  content =
    content.slice(0, insertPos) +
    INDEX_MARKER +
    content.slice(insertPos)
  fs.writeFileSync(install.indexHtml, content, 'utf8')
}

function patchMain(install: AppInstall, dict: Dict): void {
  let content = fs.readFileSync(install.mainJs, 'utf8')
  content = stripOldMainPatch(content)
  const patch = buildMenuPatch(dict)
  content = content.replace(/\s+$/, '') + '\n' + patch
  fs.writeFileSync(install.mainJs, content, 'utf8')
}

export interface PatchResult {
  version: string
  indexPatched: boolean
  mainPatched: boolean
  runtimeWritten: boolean
  backupCreated: boolean
}

export function patch(install: AppInstall, dict: Dict): PatchResult {
  const state = getState(install)
  if (state === 'broken') {
    throw new Error(
      `版本 ${install.version} 处于异常状态（已注入但无备份），无法继续。建议重装 GitHub Desktop。`
    )
  }

  const hadBackup = fs.existsSync(backupPath(install.indexHtml))
  ensureBackup(install)

  writeRuntime(install, dict)
  patchIndex(install)
  patchMain(install, dict)

  return {
    version: install.version,
    indexPatched: true,
    mainPatched: true,
    runtimeWritten: true,
    backupCreated: !hadBackup,
  }
}

export function restore(install: AppInstall): boolean {
  const state = getState(install)
  if (state === 'none') {
    throw new Error(`版本 ${install.version} 未汉化，无需还原。`)
  }
  if (state === 'broken') {
    throw new Error(
      `版本 ${install.version} 处于异常状态（已注入但无备份），无法还原。建议重装 GitHub Desktop。`
    )
  }

  const idxBak = backupPath(install.indexHtml)
  const mainBak = backupPath(install.mainJs)
  if (fs.existsSync(idxBak)) {
    fs.copyFileSync(idxBak, install.indexHtml)
    fs.unlinkSync(idxBak)
  }
  if (fs.existsSync(mainBak)) {
    fs.copyFileSync(mainBak, install.mainJs)
    fs.unlinkSync(mainBak)
  }

  const zhDir = path.join(install.appDir, 'zh')
  if (fs.existsSync(zhDir)) {
    rmrf(zhDir)
  }
  return true
}

function rmrf(target: string): void {
  if (!fs.existsSync(target)) return
  const stat = fs.statSync(target)
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      rmrf(path.join(target, entry))
    }
    fs.rmdirSync(target)
  } else {
    fs.unlinkSync(target)
  }
}

export { PATCH_START, PATCH_END }

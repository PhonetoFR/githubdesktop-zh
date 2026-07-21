import * as fs from 'fs'
import * as path from 'path'
import { AppInstall, backupPath } from './locator'
import { Dict } from './dict'
import { Rule } from './rules'
import { buildRuntime, RUNTIME_HEADER } from './runtime'
import { buildMenuPatch, PATCH_START, PATCH_END } from './menu-patch'

const RUNTIME_DIR = 'zh'
const RUNTIME_FILE = 'runtime.js'
const RUNTIME_MARKER = `${RUNTIME_DIR}/${RUNTIME_FILE}`
const INDEX_MARKER = `<script defer="defer" src="${RUNTIME_MARKER}"></script>`
const INDEX_INSERT_AFTER = '<script defer="defer" src="renderer.js"></script>'

export type PatchState = 'none' | 'patched' | 'restored' | 'broken'

export interface InstallStatus {
  version: string
  state: PatchState
  hasBackup: boolean
  isPatched: boolean
}

interface PatchParts {
  index: boolean
  mainStart: boolean
  mainEnd: boolean
  mainComplete: boolean
  runtime: boolean
}

function runtimeDir(install: AppInstall): string {
  return path.join(install.appDir, RUNTIME_DIR)
}

function runtimePath(install: AppInstall): string {
  return path.join(runtimeDir(install), RUNTIME_FILE)
}

function hasCompleteBackup(install: AppInstall): boolean {
  return fs.existsSync(backupPath(install.indexHtml)) &&
    fs.existsSync(backupPath(install.mainJs))
}

function hasPartialBackup(install: AppInstall): boolean {
  return fs.existsSync(backupPath(install.indexHtml)) !==
    fs.existsSync(backupPath(install.mainJs))
}

function isOwnedRuntime(file: string): boolean {
  try {
    return fs.readFileSync(file, 'utf8').startsWith(RUNTIME_HEADER)
  } catch {
    return false
  }
}

function countOccurrences(content: string, marker: string): number {
  let count = 0
  let offset = 0
  while (true) {
    const index = content.indexOf(marker, offset)
    if (index < 0) return count
    count++
    offset = index + marker.length
  }
}

function getPatchParts(install: AppInstall): PatchParts {
  let index = false
  let mainStart = false
  let mainEnd = false
  let mainComplete = false

  try {
    index = fs.readFileSync(install.indexHtml, 'utf8').includes(INDEX_MARKER)
    const main = fs.readFileSync(install.mainJs, 'utf8')
    const start = main.indexOf(PATCH_START)
    const end = main.indexOf(PATCH_END)
    mainStart = start >= 0
    mainEnd = end >= 0
    mainComplete = mainStart && mainEnd && start < end &&
      countOccurrences(main, PATCH_START) === 1 &&
      countOccurrences(main, PATCH_END) === 1
  } catch {
    // Missing or unreadable application files are treated as an abnormal state.
  }

  return {
    index,
    mainStart,
    mainEnd,
    mainComplete,
    runtime: isOwnedRuntime(runtimePath(install)),
  }
}

function checkPatched(install: AppInstall): boolean {
  const parts = getPatchParts(install)
  return parts.index && parts.mainComplete && parts.runtime
}

function hasAnyPatchPart(parts: PatchParts): boolean {
  return parts.index || parts.mainStart || parts.mainEnd || parts.runtime
}

function sourcesMatchBackups(install: AppInstall): boolean {
  try {
    return fs.readFileSync(install.indexHtml, 'utf8') ===
        fs.readFileSync(backupPath(install.indexHtml), 'utf8') &&
      fs.readFileSync(install.mainJs, 'utf8') ===
        fs.readFileSync(backupPath(install.mainJs), 'utf8')
  } catch {
    return false
  }
}

export function getState(install: AppInstall): PatchState {
  if (hasPartialBackup(install)) return 'broken'

  const hasBackup = hasCompleteBackup(install)
  const parts = getPatchParts(install)
  const isPatched = parts.index && parts.mainComplete && parts.runtime

  if (isPatched) return hasBackup ? 'patched' : 'broken'
  if (hasAnyPatchPart(parts)) return 'broken'
  if (hasBackup) return sourcesMatchBackups(install) ? 'restored' : 'broken'
  return 'none'
}

export function getStatus(install: AppInstall): InstallStatus {
  const state = getState(install)
  return {
    version: install.version,
    state,
    hasBackup: hasCompleteBackup(install),
    isPatched: checkPatched(install),
  }
}

function ensureBackup(install: AppInstall): boolean {
  const idxBak = backupPath(install.indexHtml)
  const mainBak = backupPath(install.mainJs)
  const hasIndexBackup = fs.existsSync(idxBak)
  const hasMainBackup = fs.existsSync(mainBak)
  if (hasIndexBackup !== hasMainBackup) {
    throw new Error('备份不完整，无法继续。请先使用完整备份还原，或重装 GitHub Desktop。')
  }
  if (hasIndexBackup) return false

  let indexBackupCreated = false
  try {
    fs.copyFileSync(install.indexHtml, idxBak, fs.constants.COPYFILE_EXCL)
    indexBackupCreated = true
    fs.copyFileSync(install.mainJs, mainBak, fs.constants.COPYFILE_EXCL)
  } catch (error) {
    if (indexBackupCreated) {
      try {
        fs.unlinkSync(idxBak)
      } catch {
        // A remaining partial backup is detected as broken on the next run.
      }
    }
    throw new Error(`创建备份失败: ${errorMessage(error)}`)
  }
  return true
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

function buildPatchedIndex(content: string): string {
  content = stripOldIndexPatch(content)
  const idx = content.indexOf(INDEX_INSERT_AFTER)
  if (idx < 0) {
    throw new Error(
      `index.html 中未找到注入锚点: ${INDEX_INSERT_AFTER}`
    )
  }
  const insertPos = idx + INDEX_INSERT_AFTER.length
  return content.slice(0, insertPos) + INDEX_MARKER + content.slice(insertPos)
}

function buildPatchedMain(content: string, dict: Dict): string {
  return buildMenuPatch(dict) + '\n' + stripOldMainPatch(content)
}

function assertRuntimeCanBeWritten(install: AppInstall): void {
  const file = runtimePath(install)
  if (fs.existsSync(file) && !isOwnedRuntime(file)) {
    throw new Error(`发现非本工具创建的文件，拒绝覆盖: ${file}`)
  }
}

function removeEmptyRuntimeDir(install: AppInstall): void {
  try {
    fs.rmdirSync(runtimeDir(install))
  } catch {
    // Keep a non-empty directory or ignore a directory removed by another process.
  }
}

function writePatchFiles(
  install: AppInstall,
  runtime: string,
  index: string,
  main: string
): void {
  const file = runtimePath(install)
  const dir = runtimeDir(install)
  const previousIndex = fs.readFileSync(install.indexHtml, 'utf8')
  const previousMain = fs.readFileSync(install.mainJs, 'utf8')
  const runtimeExisted = fs.existsSync(file)
  const previousRuntime = runtimeExisted ? fs.readFileSync(file, 'utf8') : null
  const dirExisted = fs.existsSync(dir)
  let runtimeAttempted = false
  let indexAttempted = false
  let mainAttempted = false

  try {
    if (!dirExisted) fs.mkdirSync(dir, { recursive: true })
    runtimeAttempted = true
    fs.writeFileSync(file, runtime, 'utf8')
    indexAttempted = true
    fs.writeFileSync(install.indexHtml, index, 'utf8')
    mainAttempted = true
    fs.writeFileSync(install.mainJs, main, 'utf8')
  } catch (error) {
    const rollbackErrors: string[] = []
    if (mainAttempted) {
      try {
        fs.writeFileSync(install.mainJs, previousMain, 'utf8')
      } catch (rollbackError) {
        rollbackErrors.push(errorMessage(rollbackError))
      }
    }
    if (indexAttempted) {
      try {
        fs.writeFileSync(install.indexHtml, previousIndex, 'utf8')
      } catch (rollbackError) {
        rollbackErrors.push(errorMessage(rollbackError))
      }
    }
    if (runtimeAttempted) {
      try {
        if (runtimeExisted && previousRuntime !== null) {
          fs.writeFileSync(file, previousRuntime, 'utf8')
        } else if (fs.existsSync(file)) {
          fs.unlinkSync(file)
        }
      } catch (rollbackError) {
        rollbackErrors.push(errorMessage(rollbackError))
      }
    }
    if (!dirExisted) removeEmptyRuntimeDir(install)

    const rollbackNote = rollbackErrors.length === 0
      ? '已回滚修改'
      : `回滚未完全完成: ${rollbackErrors.join('; ')}`
    throw new Error(`写入补丁失败，${rollbackNote}: ${errorMessage(error)}`)
  }
}

function restoreFiles(install: AppInstall): void {
  const idxBak = backupPath(install.indexHtml)
  const mainBak = backupPath(install.mainJs)
  const restoredIndex = fs.readFileSync(idxBak, 'utf8')
  const restoredMain = fs.readFileSync(mainBak, 'utf8')
  const previousIndex = fs.readFileSync(install.indexHtml, 'utf8')
  const previousMain = fs.readFileSync(install.mainJs, 'utf8')
  const file = runtimePath(install)
  const runtimeExisted = fs.existsSync(file)
  const ownedRuntime = runtimeExisted && isOwnedRuntime(file)
  const previousRuntime = ownedRuntime ? fs.readFileSync(file, 'utf8') : null
  let runtimeRemoved = false
  let indexAttempted = false
  let mainAttempted = false

  try {
    if (ownedRuntime) {
      fs.unlinkSync(file)
      runtimeRemoved = true
    }
    indexAttempted = true
    fs.writeFileSync(install.indexHtml, restoredIndex, 'utf8')
    mainAttempted = true
    fs.writeFileSync(install.mainJs, restoredMain, 'utf8')
    if (runtimeRemoved) removeEmptyRuntimeDir(install)
  } catch (error) {
    const rollbackErrors: string[] = []
    if (mainAttempted) {
      try {
        fs.writeFileSync(install.mainJs, previousMain, 'utf8')
      } catch (rollbackError) {
        rollbackErrors.push(errorMessage(rollbackError))
      }
    }
    if (indexAttempted) {
      try {
        fs.writeFileSync(install.indexHtml, previousIndex, 'utf8')
      } catch (rollbackError) {
        rollbackErrors.push(errorMessage(rollbackError))
      }
    }
    if (runtimeRemoved && previousRuntime !== null) {
      try {
        fs.mkdirSync(runtimeDir(install), { recursive: true })
        fs.writeFileSync(file, previousRuntime, 'utf8')
      } catch (rollbackError) {
        rollbackErrors.push(errorMessage(rollbackError))
      }
    }

    const rollbackNote = rollbackErrors.length === 0
      ? '已回滚修改'
      : `回滚未完全完成: ${rollbackErrors.join('; ')}`
    throw new Error(`还原失败，${rollbackNote}: ${errorMessage(error)}`)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface PatchResult {
  version: string
  indexPatched: boolean
  mainPatched: boolean
  runtimeWritten: boolean
  backupCreated: boolean
}

export type DesktopProcessState = 'running' | 'not-running' | 'unknown'

export function getDesktopProcessState(): DesktopProcessState {
  const { execFileSync } = require('child_process')
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq GitHubDesktop.exe', '/NH', '/FO', 'CSV'], {
        encoding: 'utf8',
        windowsHide: true,
      })
      return /GitHubDesktop\.exe/i.test(out) ? 'running' : 'not-running'
    }
    if (process.platform === 'darwin') {
      execFileSync('pgrep', ['-x', 'GitHub Desktop'], { encoding: 'utf8' })
      return 'running'
    }
    if (process.platform === 'linux') {
      execFileSync('pgrep', ['-x', 'GitHubDesktop'], { encoding: 'utf8' })
      return 'running'
    }
  } catch (error) {
    if (process.platform !== 'win32' &&
      typeof error === 'object' && error !== null &&
      'status' in error && (error as { status?: number }).status === 1) {
      return 'not-running'
    }
    return 'unknown'
  }
  return 'unknown'
}

export function isDesktopRunning(): boolean {
  return getDesktopProcessState() === 'running'
}

export function patch(install: AppInstall, dict: Dict, rules: Rule[]): PatchResult {
  const state = getState(install)
  if (state === 'broken') {
    throw new Error(
      `版本 ${install.version} 处于异常状态（补丁或备份不完整），无法继续。请先还原；如无完整备份，请重装 GitHub Desktop。`
    )
  }

  const index = buildPatchedIndex(fs.readFileSync(install.indexHtml, 'utf8'))
  const main = buildPatchedMain(fs.readFileSync(install.mainJs, 'utf8'), dict)
  const runtime = buildRuntime(dict, rules)
  assertRuntimeCanBeWritten(install)
  const backupCreated = ensureBackup(install)

  writePatchFiles(install, runtime, index, main)

  return {
    version: install.version,
    indexPatched: true,
    mainPatched: true,
    runtimeWritten: true,
    backupCreated,
  }
}

export function restore(install: AppInstall): boolean {
  const state = getState(install)
  if (state === 'none') {
    throw new Error(`版本 ${install.version} 未汉化，无需还原。`)
  }
  if (!hasCompleteBackup(install)) {
    throw new Error(
      `版本 ${install.version} 缺少完整备份，无法还原。建议重装 GitHub Desktop。`
    )
  }

  restoreFiles(install)
  return true
}

export { PATCH_START, PATCH_END }

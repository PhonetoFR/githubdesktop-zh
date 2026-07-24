import { loadDict } from './dict'
import { findInstallByVersion, getNewestInstall, AppInstall } from './locator'
import {
  getDesktopProcessState,
  getStatus,
  InstallStatus,
  patch,
  PatchResult,
  restore,
  DesktopProcessState,
} from './patcher'
import { getRules } from './rules'

export type ApplicationErrorCode =
  | 'install-not-found'
  | 'desktop-running'
  | 'process-unknown'
  | 'broken-patch'
  | 'already-restored'
  | 'backup-missing'

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ApplicationError'
  }
}

export interface ApplicationSnapshot {
  installs: InstallStatus[]
  newestVersion: string | null
  processState: DesktopProcessState
}

export function getInstallStatuses(installs: AppInstall[]): InstallStatus[] {
  return installs.map(getStatus)
}

export function selectTarget(
  installs: AppInstall[],
  version?: string
): AppInstall {
  if (version !== undefined) {
    const install = findInstallByVersion(installs, version)
    if (!install) {
      throw new ApplicationError(
        'install-not-found',
        `未找到指定版本 ${version}，可用版本: ${installs.map(i => i.version).join(', ')}`
      )
    }
    return install
  }

  const newest = getNewestInstall(installs)
  if (!newest) {
    throw new ApplicationError('install-not-found', '未找到任何 GitHub Desktop 安装')
  }
  return newest
}

export function getApplicationSnapshot(installs: AppInstall[]): ApplicationSnapshot {
  return {
    installs: getInstallStatuses(installs),
    newestVersion: getNewestInstall(installs)?.version ?? null,
    processState: getDesktopProcessState(),
  }
}

export function ensureDesktopStopped(state: DesktopProcessState): void {
  if (state === 'running') {
    throw new ApplicationError(
      'desktop-running',
      '检测到 GitHub Desktop 正在运行，请先关闭它再操作。'
    )
  }
  if (state === 'unknown') {
    throw new ApplicationError(
      'process-unknown',
      '无法确认 GitHub Desktop 是否已关闭，为避免损坏文件，已取消操作。'
    )
  }
}

export function applyPatch(
  installs: AppInstall[],
  version?: string
): PatchResult {
  const target = selectTarget(installs, version)
  if (getStatus(target).state === 'broken') {
    throw new ApplicationError(
      'broken-patch',
      `v${target.version} 处于异常状态，无法汉化。请先还原；如无完整备份，请重装 GitHub Desktop。`
    )
  }

  ensureDesktopStopped(getDesktopProcessState())
  return patch(target, loadDict(), getRules())
}

export function restoreOriginal(
  installs: AppInstall[],
  version?: string
): string {
  const target = selectTarget(installs, version)
  const status = getStatus(target)
  if (status.state === 'none') {
    throw new ApplicationError(
      'already-restored',
      `v${target.version} 当前未汉化，无需还原。`
    )
  }
  if (status.state === 'broken' && !status.hasBackup) {
    throw new ApplicationError(
      'backup-missing',
      `v${target.version} 缺少完整备份，无法还原。建议重装 GitHub Desktop。`
    )
  }

  ensureDesktopStopped(getDesktopProcessState())
  restore(target)
  return target.version
}

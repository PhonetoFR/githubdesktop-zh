import { loadDict } from './dict'
import { getRules } from './rules'
import { findInstalls, getNewestInstall, findInstallByVersion, AppInstall } from './locator'
import { patch, restore, getStatus, getDesktopProcessState, PatchState, InstallStatus } from './patcher'
import { menu, close } from './prompt'
import * as log from './log'
import pkg from '../package.json'

const STATE_LABEL: Record<PatchState, string> = {
  none: '未汉化',
  patched: '已汉化',
  restored: '已还原(备份保留)',
  broken: '异常(补丁或备份不完整)',
}

function printStatus(installs: AppInstall[], versionFlag?: string): InstallStatus[] {
  const targets = versionFlag ? [selectTarget(installs, versionFlag)] : installs
  const statuses = targets.map(getStatus)
  log.info(`检测到 ${targets.length} 个 GitHub Desktop 安装:`)
  for (const s of statuses) {
    const flag = s.state === 'patched' ? '[汉]' : s.state === 'broken' ? '[!]' : '   '
    process.stdout.write(`  ${flag} v${s.version}  ${STATE_LABEL[s.state]}\n`)
  }
  return statuses
}

function selectTarget(installs: AppInstall[], versionFlag?: string): AppInstall {
  if (versionFlag) {
    const inst = findInstallByVersion(installs, versionFlag)
    if (!inst) {
      throw new Error(`未找到指定版本 ${versionFlag}，可用版本: ${installs.map(i => i.version).join(', ')}`)
    }
    return inst
  }
  const newest = getNewestInstall(installs)
  if (!newest) throw new Error('未找到任何 GitHub Desktop 安装')
  return newest
}

function ensureDesktopStopped(): boolean {
  const state = getDesktopProcessState()
  if (state === 'running') {
    log.warn('检测到 GitHub Desktop 正在运行，请先关闭它再操作，否则可能不生效。')
    return false
  }
  if (state === 'unknown') {
    log.error('无法确认 GitHub Desktop 是否已关闭，为避免损坏文件，已取消操作。')
    return false
  }
  return true
}

function doPatch(installs: AppInstall[], versionFlag?: string): boolean {
  const dict = loadDict()
  const rules = getRules()
  const target = selectTarget(installs, versionFlag)
  const state = getStatus(target).state
  if (state === 'broken') {
    log.error(`v${target.version} 处于异常状态，无法汉化。请先还原；如无完整备份，请重装 GitHub Desktop。`)
    return false
  }
  if (!ensureDesktopStopped()) return false
  log.info(`开始汉化 v${target.version} ...`)
  const result = patch(target, dict, rules)
  log.success(`汉化完成 v${result.version}`)
  process.stdout.write(`  索引注入: ${result.indexPatched ? '成功' : '跳过'}\n`)
  process.stdout.write(`  菜单注入: ${result.mainPatched ? '成功' : '跳过'}\n`)
  process.stdout.write(`  运行时写入: ${result.runtimeWritten ? '成功' : '跳过'}\n`)
  process.stdout.write(`  备份创建: ${result.backupCreated ? '是' : '已存在'}\n`)
  log.info('请重新打开 GitHub Desktop 以查看效果。')
  return true
}

function doRestore(installs: AppInstall[], versionFlag?: string): boolean {
  const target = selectTarget(installs, versionFlag)
  const status = getStatus(target)
  const state = status.state
  if (state === 'none') {
    log.warn(`v${target.version} 未汉化，无需还原。`)
    return false
  }
  if (state === 'broken' && !status.hasBackup) {
    log.error(`v${target.version} 缺少完整备份，无法还原。建议重装 GitHub Desktop。`)
    return false
  }
  if (state === 'broken') {
    log.warn(`v${target.version} 处于异常状态，将从完整备份还原。`)
  }
  if (!ensureDesktopStopped()) return false
  log.info(`开始还原 v${target.version} ...`)
  restore(target)
  log.success(`还原完成 v${target.version}`)
  log.info('请重新打开 GitHub Desktop 以确认已恢复英文。')
  return true
}

function printHelp(): void {
  process.stdout.write(
`GitHub Desktop 汉化补丁

用法:
  github-desktop-zh              交互式菜单
  github-desktop-zh --patch      一键汉化(最新版)
  github-desktop-zh --restore    还原原版(最新版)
  github-desktop-zh --status     查看汉化状态
  github-desktop-zh --version    显示工具版本
  github-desktop-zh --help       显示帮助

选项:
  --patch --target=<ver>         指定目标版本(如 3.6.2)
  --restore --target=<ver>       还原指定版本
  --status --target=<ver>        查看指定版本状态

仓库: https://github.com/PhonetoFR/githubdesktop-zh
`
  )
}

function parseArgs(argv: string[]): {
  cmd: 'patch' | 'restore' | 'status' | 'help' | 'version' | 'menu'
  target?: string
} {
  let cmd: 'patch' | 'restore' | 'status' | 'help' | 'version' | 'menu' = 'menu'
  let target: string | undefined
  for (const arg of argv.slice(2)) {
    if (arg === '--patch') cmd = 'patch'
    else if (arg === '--restore') cmd = 'restore'
    else if (arg === '--status') cmd = 'status'
    else if (arg === '--help' || arg === '-h') cmd = 'help'
    else if (arg === '--version' || arg === '-v') cmd = 'version'
    else if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
  }
  return { cmd, target }
}

async function interactiveMenu(installs: AppInstall[]): Promise<void> {
  const statuses = printStatus(installs)
  const newest = getNewestInstall(installs)
  if (!newest) {
    log.error('未找到任何 GitHub Desktop 安装，退出。')
    return
  }

  const newestStatus = statuses[statuses.length - 1]
  const patchLabel = newestStatus.state === 'patched' ? '重新汉化' : '一键汉化'
  const restoreLabel = newestStatus.state === 'patched' ? '还原原版' : '还原原版(当前未汉化)'

  const choice = await menu(`请选择操作 (目标: v${newest.version})`, [
    { label: patchLabel, description: `汉化 v${newest.version}` },
    { label: restoreLabel, description: `还原 v${newest.version}` },
    { label: '查看状态', description: '显示所有版本汉化状态' },
    { label: '退出' },
  ])

  switch (choice) {
    case 0:
      doPatch(installs, newest.version)
      break
    case 1:
      doRestore(installs, newest.version)
      break
    case 2:
      printStatus(installs)
      break
    case 3:
      log.info('再见。')
      return
  }

  const again = await menu('', [
    { label: '返回主菜单' },
    { label: '退出' },
  ])
  if (again === 0) {
    await interactiveMenu(installs)
  } else {
    log.info('再见。')
  }
}

async function main(): Promise<void> {
  const { cmd, target } = parseArgs(process.argv)

  if (cmd === 'help') {
    printHelp()
    return
  }
  if (cmd === 'version') {
    process.stdout.write(`github-desktop-zh v${pkg.version}\n`)
    return
  }

  try {
    const { installs } = findInstalls()
    if (installs.length === 0) {
      log.error('未找到任何 GitHub Desktop 安装。请先安装 GitHub Desktop。')
      process.exit(1)
    }

    switch (cmd) {
      case 'patch':
        if (!doPatch(installs, target)) process.exitCode = 1
        break
      case 'restore':
        if (!doRestore(installs, target)) process.exitCode = 1
        break
      case 'status':
        printStatus(installs, target)
        break
      case 'menu':
        await interactiveMenu(installs)
        break
    }
  } catch (e) {
    log.error((e as Error).message)
    process.exit(1)
  } finally {
    close()
  }
}

main().catch(e => {
  log.error((e as Error).message)
  process.exit(1)
})

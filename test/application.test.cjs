const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  ApplicationError,
  ensureDesktopStopped,
  getApplicationSnapshot,
  getInstallStatuses,
  selectTarget,
} = require('../dist/application.js')

function createInstall(root, version) {
  const appDir = path.join(root, `app-${version}`, 'resources', 'app')
  fs.mkdirSync(appDir, { recursive: true })
  const indexHtml = path.join(appDir, 'index.html')
  const mainJs = path.join(appDir, 'main.js')
  fs.writeFileSync(indexHtml, '<script defer="defer" src="renderer.js"></script>', 'utf8')
  fs.writeFileSync(mainJs, 'console.log("main")', 'utf8')
  return {
    version,
    appDir,
    indexHtml,
    mainJs,
    rendererJs: path.join(appDir, 'renderer.js'),
    packageJson: path.join(appDir, 'package.json'),
  }
}

test('selectTarget 默认选择最新安装并支持指定版本', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'github-desktop-zh-app-'))
  try {
    const oldInstall = createInstall(root, '3.6.2')
    const newInstall = createInstall(root, '3.6.3')
    const installs = [oldInstall, newInstall]
    assert.equal(selectTarget(installs).version, '3.6.3')
    assert.equal(selectTarget(installs, '3.6.2').version, '3.6.2')
    assert.throws(
      () => selectTarget(installs, '9.9.9'),
      error => error instanceof ApplicationError && error.code === 'install-not-found'
    )
    assert.throws(
      () => selectTarget(installs, ''),
      error => error instanceof ApplicationError && error.code === 'install-not-found'
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('共享服务返回可供 CLI 与 GUI 使用的安装状态', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'github-desktop-zh-app-'))
  try {
    const installs = [createInstall(root, '3.6.2'), createInstall(root, '3.6.3')]
    const statuses = getInstallStatuses(installs)
    const snapshot = getApplicationSnapshot(installs)
    assert.deepEqual(statuses.map(status => status.state), ['none', 'none'])
    assert.equal(snapshot.newestVersion, '3.6.3')
    assert.deepEqual(snapshot.installs, statuses)
    assert.ok(['running', 'not-running', 'unknown'].includes(snapshot.processState))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('进程安全检查阻止运行中或无法确认的状态', () => {
  assert.doesNotThrow(() => ensureDesktopStopped('not-running'))
  assert.throws(
    () => ensureDesktopStopped('running'),
    error => error instanceof ApplicationError && error.code === 'desktop-running'
  )
  assert.throws(
    () => ensureDesktopStopped('unknown'),
    error => error instanceof ApplicationError && error.code === 'process-unknown'
  )
})

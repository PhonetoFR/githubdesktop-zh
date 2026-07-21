const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  patch,
  restore,
  getState,
  getStatus,
  getDesktopProcessState,
  isDesktopRunning,
  PATCH_END,
} = require('../dist/patcher.js')
const { backupPath } = require('../dist/locator.js')
const { RUNTIME_HEADER } = require('../dist/runtime.js')

const dict = { Hello: '你好' }

function createFixture(version = '3.6.2', root = fs.mkdtempSync(path.join(os.tmpdir(), 'github-desktop-zh-'))) {
  const appDir = path.join(root, 'GitHubDesktop', `app-${version}`, 'resources', 'app')
  const indexHtml = path.join(appDir, 'index.html')
  const mainJs = path.join(appDir, 'main.js')
  const originalIndex = '<script defer="defer" src="renderer.js"></script>\n<body></body>\n'
  const originalMain = 'console.log("original main")\n'
  fs.mkdirSync(appDir, { recursive: true })
  fs.writeFileSync(indexHtml, originalIndex, 'utf8')
  fs.writeFileSync(mainJs, originalMain, 'utf8')

  return {
    root,
    install: {
      version,
      appDir,
      indexHtml,
      mainJs,
      rendererJs: path.join(appDir, 'renderer.js'),
      packageJson: path.join(appDir, 'package.json'),
    },
    originalIndex,
    originalMain,
  }
}

function removeFixture(fixture) {
  fs.rmSync(fixture.root, { recursive: true, force: true })
}

function withFixture(run) {
  const fixture = createFixture()
  try {
    run(fixture)
  } finally {
    removeFixture(fixture)
  }
}

test('补丁和还原只清理本工具运行时，保留 zh 目录中的其他文件', () => {
  withFixture(({ install, originalIndex, originalMain }) => {
    const zhDir = path.join(install.appDir, 'zh')
    const notePath = path.join(zhDir, 'user-note.txt')
    fs.mkdirSync(zhDir)
    fs.writeFileSync(notePath, 'keep me', 'utf8')

    const result = patch(install, dict, [])
    assert.equal(result.backupCreated, true)
    assert.equal(getState(install), 'patched')
    assert.ok(fs.readFileSync(path.join(zhDir, 'runtime.js'), 'utf8').startsWith(RUNTIME_HEADER))

    restore(install)
    assert.equal(fs.readFileSync(install.indexHtml, 'utf8'), originalIndex)
    assert.equal(fs.readFileSync(install.mainJs, 'utf8'), originalMain)
    assert.equal(fs.existsSync(path.join(zhDir, 'runtime.js')), false)
    assert.equal(fs.readFileSync(notePath, 'utf8'), 'keep me')
    assert.equal(getState(install), 'restored')
    assert.deepEqual(getStatus(install), {
      version: '3.6.2',
      state: 'restored',
      hasBackup: true,
      isPatched: false,
    })
  })
})

test('拒绝覆盖非本工具创建的 runtime.js，且不创建备份或注入', () => {
  withFixture(({ install, originalIndex, originalMain }) => {
    const zhDir = path.join(install.appDir, 'zh')
    fs.mkdirSync(zhDir)
    fs.writeFileSync(path.join(zhDir, 'runtime.js'), 'user runtime', 'utf8')

    assert.throws(() => patch(install, dict, []), /拒绝覆盖/)
    assert.equal(fs.readFileSync(install.indexHtml, 'utf8'), originalIndex)
    assert.equal(fs.readFileSync(install.mainJs, 'utf8'), originalMain)
    assert.equal(fs.existsSync(backupPath(install.indexHtml)), false)
    assert.equal(fs.existsSync(backupPath(install.mainJs)), false)
  })
})

test('缺失运行时或主进程结束标记时标记为异常，并可用完整备份还原', () => {
  withFixture(({ install, originalIndex, originalMain }) => {
    patch(install, dict, [])
    fs.unlinkSync(path.join(install.appDir, 'zh', 'runtime.js'))
    assert.equal(getState(install), 'broken')
    restore(install)
    assert.equal(getState(install), 'restored')

    patch(install, dict, [])
    const main = fs.readFileSync(install.mainJs, 'utf8').replace(PATCH_END, '')
    fs.writeFileSync(install.mainJs, main, 'utf8')
    assert.equal(getState(install), 'broken')
    restore(install)
    assert.equal(fs.readFileSync(install.indexHtml, 'utf8'), originalIndex)
    assert.equal(fs.readFileSync(install.mainJs, 'utf8'), originalMain)
    assert.equal(getState(install), 'restored')
  })
})

test('半套备份视为异常，不能继续汉化或还原', () => {
  withFixture(({ install, originalIndex }) => {
    fs.writeFileSync(backupPath(install.indexHtml), originalIndex, 'utf8')
    assert.equal(getState(install), 'broken')
    assert.equal(getStatus(install).hasBackup, false)
    assert.throws(() => patch(install, dict, []), /异常状态/)
    assert.throws(() => restore(install), /缺少完整备份/)
  })
})

test('补丁写入失败时回滚已写入的文件', () => {
  withFixture(({ install, originalIndex, originalMain }) => {
    const originalWriteFileSync = fs.writeFileSync
    let failOnce = true
    fs.writeFileSync = function (file, data, ...args) {
      if (failOnce && file === install.mainJs && typeof data === 'string' && data.includes(PATCH_END)) {
        failOnce = false
        throw new Error('simulated write failure')
      }
      return originalWriteFileSync.call(fs, file, data, ...args)
    }

    try {
      assert.throws(() => patch(install, dict, []), /已回滚修改/)
    } finally {
      fs.writeFileSync = originalWriteFileSync
    }

    assert.equal(fs.readFileSync(install.indexHtml, 'utf8'), originalIndex)
    assert.equal(fs.readFileSync(install.mainJs, 'utf8'), originalMain)
    assert.equal(fs.existsSync(path.join(install.appDir, 'zh', 'runtime.js')), false)
    assert.equal(getState(install), 'restored')
  })
})

test('还原写入失败时回滚并保持完整补丁', () => {
  withFixture(({ install, originalMain }) => {
    patch(install, dict, [])
    const originalWriteFileSync = fs.writeFileSync
    let failOnce = true
    fs.writeFileSync = function (file, data, ...args) {
      if (failOnce && file === install.mainJs && data === originalMain) {
        failOnce = false
        throw new Error('simulated write failure')
      }
      return originalWriteFileSync.call(fs, file, data, ...args)
    }

    try {
      assert.throws(() => restore(install), /已回滚修改/)
    } finally {
      fs.writeFileSync = originalWriteFileSync
    }

    assert.equal(getState(install), 'patched')
    assert.equal(fs.existsSync(path.join(install.appDir, 'zh', 'runtime.js')), true)
  })
})

test('--status --target 只显示指定版本', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'github-desktop-zh-'))
  try {
    createFixture('3.6.2', root)
    createFixture('3.6.3', root)
    const result = spawnSync(process.execPath, [
      path.join(__dirname, '..', 'dist', 'main.js'),
      '--status',
      '--target=3.6.2',
    ], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, LOCALAPPDATA: root },
      encoding: 'utf8',
      windowsHide: true,
    })

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /检测到 1 个 GitHub Desktop 安装/)
    assert.match(result.stdout, /v3\.6\.2/)
    assert.doesNotMatch(result.stdout, /v3\.6\.3/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('--patch 在异常状态下返回非零退出码', () => {
  const fixture = createFixture()
  try {
    fs.writeFileSync(backupPath(fixture.install.indexHtml), fixture.originalIndex, 'utf8')
    const result = spawnSync(process.execPath, [
      path.join(__dirname, '..', 'dist', 'main.js'),
      '--patch',
      '--target=3.6.2',
    ], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, LOCALAPPDATA: fixture.root },
      encoding: 'utf8',
      windowsHide: true,
    })

    assert.equal(result.status, 1)
    assert.match(result.stderr, /处于异常状态/)
  } finally {
    removeFixture(fixture)
  }
})

test('isDesktopRunning 返回布尔值且不抛异常', () => {
  const result = isDesktopRunning()
  assert.strictEqual(typeof result, 'boolean')
})

test('getDesktopProcessState 返回受支持状态', () => {
  const result = getDesktopProcessState()
  assert.ok(['running', 'not-running', 'unknown'].includes(result))
})

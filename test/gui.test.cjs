const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

test('默认打包目标是单文件 portable exe，不包含安装器目标', () => {
  assert.equal(packageJson.main, 'dist/gui-main.js')
  assert.equal(packageJson.scripts.package, 'npm run package:gui')
  const targets = packageJson.build.win.target.map(target => target.target)
  assert.deepEqual(targets, ['portable'])
  assert.match(packageJson.build.win.artifactName, /portable\.\$\{ext\}$/)
  assert.ok(!targets.some(target => ['nsis', 'msi', 'msi-wrapped'].includes(target)))
  assert.match(packageJson.scripts.build, /clean:dist/)
  assert.match(packageJson.scripts['package:gui'], /clean:package/)
})

test('GUI 静态资源被打包且页面启用严格 CSP', () => {
  const files = packageJson.build.files
  assert.ok(files.includes('gui/**/*'))
  assert.ok(files.includes('dist/**/*.js'))

  const html = fs.readFileSync(path.join(root, 'gui', 'index.html'), 'utf8')
  assert.match(html, /Content-Security-Policy/)
  assert.match(html, /script-src 'self'/)
  assert.match(html, /object-src 'none'/)
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/)
})

test('Electron 窗口启用上下文隔离、沙箱并关闭 Node 集成', () => {
  const main = fs.readFileSync(path.join(root, 'dist', 'gui-main.js'), 'utf8')
  assert.match(main, /contextIsolation:\s*true/)
  assert.match(main, /nodeIntegration:\s*false/)
  assert.match(main, /sandbox:\s*true/)
  assert.match(main, /titleBarStyle:\s*'hidden'/)
  assert.match(main, /titleBarOverlay/)
  assert.match(main, /setWindowOpenHandler/)
  assert.match(main, /isTrustedSender/)

  const preload = fs.readFileSync(path.join(root, 'dist', 'gui-preload.js'), 'utf8')
  assert.match(preload, /exposeInMainWorld\('zhPatch'/)
  assert.match(preload, /ipcRenderer\.invoke/)
})

test('GUI 支持文字重排、减少动画和高对比度模式', () => {
  const css = fs.readFileSync(path.join(root, 'gui', 'styles.css'), 'utf8')
  assert.doesNotMatch(css, /body\s*\{[^}]*min-width/s)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
  assert.match(css, /forced-colors:\s*active/)
  assert.match(css, /app-region:\s*drag/)
})

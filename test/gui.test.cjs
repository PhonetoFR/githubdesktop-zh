const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const cargo = fs.readFileSync(path.join(root, 'rust', 'Cargo.toml'), 'utf8')
const ui = fs.readFileSync(path.join(root, 'rust', 'src', 'ui.rs'), 'utf8')

test('Rune 是默认发行目标', () => {
  assert.equal(pkg.scripts.package, 'npm run package:rune')
  assert.match(pkg.scripts['package:rune'], /build:rune/)
  assert.match(pkg.scripts['package:rune'], /generate:icon/)
  assert.match(pkg.scripts['package:rune'], /generate:cert/)
  assert.match(pkg.scripts['package:rune'], /package-rune\.cjs/)
  assert.match(pkg.scripts['build:rune'], /cargo\.cjs build --release/)
  assert.equal(pkg.devDependencies.electron, undefined)
  assert.equal(pkg.devDependencies['electron-builder'], undefined)
})

test('Rust 版本与 Node 版本一致', () => {
  const version = /^version\s*=\s*"([^"]+)"/m.exec(cargo)
  assert.ok(version, 'Cargo.toml 缺少版本')
  assert.equal(version[1], pkg.version)
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'rust', 'assets', 'manifest.json'), 'utf8')
  )
  assert.equal(manifest.toolVersion, pkg.version)
})

test('Rune 依赖固定到 dev rev 并带官方 patch', () => {
  assert.match(cargo, /git = "https:\/\/github\.com\/anomalyco\/rune", rev = "[0-9a-f]{40}"/)
  assert.match(cargo, /wgpu-hal = \{ path = "vendor\/wgpu-hal" \}/)
  assert.match(cargo, /winit = \{ path = "vendor\/winit" \}/)
  assert.match(cargo, /parley_engine = \{ path = "vendor\/parley_engine" \}/)
  assert.match(cargo, /accesskit_windows = \{ path = "vendor\/accesskit_windows" \}/)
})

test('界面使用 OpenCode 主题与 rune-kit 组件', () => {
  for (const name of ['Button', 'IconButton', 'Spinner', 'Kit']) {
    assert.match(ui, new RegExp(`\\b${name}\\b`), `缺少 ${name}`)
  }
  assert.match(ui, /rune_theme_opencode/)
  assert.match(ui, /FONTS/)
  assert.match(ui, /FAMILIES/)
  assert.match(ui, /rune::App::new/)
  assert.match(ui, /Titlebar::new/)
  assert.match(ui, /single_instance/)
  assert.match(ui, /window_drag/)
  assert.match(ui, /chrome_insets/)
})

test('Windows 资源包含图标与版本信息', () => {
  const packager = fs.readFileSync(path.join(root, 'scripts', 'package-rune.cjs'), 'utf8')
  assert.match(packager, /require\('rcedit'\)/)
  assert.match(packager, /'file-version': pkg\.version/)
  assert.match(packager, /version-string/)
  assert.match(packager, /build-resources', 'icon\.ico/)
})

test('Rust 翻译资产已生成且格式正确', () => {
  const runtime = fs.readFileSync(path.join(root, 'rust', 'assets', 'runtime.js'), 'utf8')
  const menu = fs.readFileSync(path.join(root, 'rust', 'assets', 'menu-patch.txt'), 'utf8')
  assert.match(runtime, /MutationObserver/)
  assert.ok(menu.startsWith('/*ZH-PATCH*/'))
  assert.match(menu, /\/\*END-ZH-PATCH\*\//)
  assert.ok(Buffer.byteLength(runtime) > 90_000)
  assert.ok(Buffer.byteLength(menu) > 90_000)
})

test('Electron 入口与依赖已移除', () => {
  assert.equal(fs.existsSync(path.join(root, 'gui')), false)
  assert.equal(fs.existsSync(path.join(root, 'src', 'gui-main.ts')), false)
  assert.equal(fs.existsSync(path.join(root, 'src', 'patcher.ts')), false)
  assert.equal(pkg.main, undefined)
  assert.equal(pkg.build, undefined)
})

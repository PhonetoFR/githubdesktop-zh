'use strict'

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const outDir = path.join(root, 'rust', 'assets')
const { buildRuntime } = require(path.join(root, 'dist', 'runtime.js'))
const { buildMenuPatch } = require(path.join(root, 'dist', 'menu-patch.js'))
const { loadDict } = require(path.join(root, 'dist', 'dict.js'))
const { getRules } = require(path.join(root, 'dist', 'rules.js'))
const pkg = require(path.join(root, 'package.json'))

const dict = loadDict()
const rules = getRules()
const runtime = buildRuntime(dict, rules)
const menuPatch = buildMenuPatch(dict, rules)
const manifest = {
  toolVersion: pkg.version,
  dictCount: Object.keys(dict).length,
  rulesCount: rules.length,
}

const files = {
  'runtime.js': runtime.endsWith('\n') ? runtime : runtime + '\n',
  'menu-patch.txt': menuPatch.endsWith('\n') ? menuPatch : menuPatch + '\n',
  'manifest.json': JSON.stringify(manifest, null, 2) + '\n',
}

let failed = false
for (const [name, content] of Object.entries(files)) {
  const file = path.join(outDir, name)
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
    if (current !== content) {
      console.error(`[rune-assets] 过期: ${path.relative(root, file)}`)
      failed = true
    }
    continue
  }
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
  console.log(`[rune-assets] ${path.relative(root, file)} (${Buffer.byteLength(content)} bytes)`)
}

if (process.argv.includes('--check') && failed) {
  console.error('[rune-assets] 请运行 npm run build:rune-assets 重新生成')
  process.exit(1)
}

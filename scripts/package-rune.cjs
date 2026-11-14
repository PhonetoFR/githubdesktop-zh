'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const pkg = require(path.join(root, 'package.json'))
const source = path.join(root, 'rust', 'target', 'release', 'github-desktop-zh.exe')
const outputDir = path.join(root, 'build')
const output = path.join(outputDir, `github-desktop-zh-${pkg.version}-portable.exe`)

if (!fs.existsSync(source)) {
  console.error(`未找到 Rust 产物: ${source}`)
  console.error('请先运行 npm run build:rune')
  process.exit(1)
}

fs.mkdirSync(outputDir, { recursive: true })
fs.copyFileSync(source, output)

function findSigntool() {
  if (process.env.SIGNTOOL) return process.env.SIGNTOOL
  const where = spawnSync('where.exe', ['signtool'], { encoding: 'utf8' })
  if (where.status === 0) {
    const first = where.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean)
    if (first && fs.existsSync(first)) return first
  }
  const kits = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin'
  if (fs.existsSync(kits)) {
    for (const version of fs.readdirSync(kits).sort().reverse()) {
      for (const arch of ['x64', 'x86']) {
        const candidate = path.join(kits, version, arch, 'signtool.exe')
        if (fs.existsSync(candidate)) return candidate
      }
    }
  }
  const cache = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache')
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache).filter(name => name.startsWith('winCodeSign'))) {
      const base = path.join(cache, dir)
      const stack = [base]
      while (stack.length > 0) {
        const current = stack.pop()
        let entries
        try {
          entries = fs.readdirSync(current, { withFileTypes: true })
        } catch {
          continue
        }
        for (const entry of entries) {
          const full = path.join(current, entry.name)
          if (entry.isDirectory()) stack.push(full)
          else if (entry.name.toLowerCase() === 'signtool.exe' && full.includes('x64')) return full
        }
      }
    }
  }
  return null
}

async function main() {
  const { rcedit } = require('rcedit')
  await rcedit(output, {
    icon: path.join(root, 'build-resources', 'icon.ico'),
    'file-version': pkg.version,
    'product-version': pkg.version,
    'version-string': {
      ProductName: 'GitHub Desktop 汉化补丁',
      FileDescription: 'GitHub Desktop 汉化补丁',
      LegalCopyright: 'MIT',
      OriginalFilename: path.basename(output),
    },
    'requested-execution-level': 'asInvoker',
  })
  console.log('[package] 已写入图标与版本信息')

  const pfx = path.join(root, 'build-resources', 'codesign.pfx')
  const passwordFile = path.join(root, 'build-resources', 'codesign-password.txt')
  const signtool = findSigntool()

  if (signtool && fs.existsSync(pfx) && fs.existsSync(passwordFile)) {
    const password = fs.readFileSync(passwordFile, 'utf8').trim()
    const sign = spawnSync(
      signtool,
      ['sign', '/fd', 'SHA256', '/f', pfx, '/p', password, output],
      { encoding: 'utf8' }
    )
    if (sign.status === 0) {
      console.log('[package] 已签名')
    } else {
      console.warn('[package] 签名失败（产物仍可使用）')
      if (sign.stdout) console.warn(sign.stdout.trim())
      if (sign.stderr) console.warn(sign.stderr.trim())
    }
  } else {
    console.warn('[package] 未找到 signtool 或证书，跳过签名')
  }

  const size = fs.statSync(output).size
  console.log(`[package] ${path.relative(root, output)} (${(size / 1024 / 1024).toFixed(2)} MB)`)
}

main().catch(error => {
  console.error(`[package] 失败: ${error.message}`)
  process.exit(1)
})

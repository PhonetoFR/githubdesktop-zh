const fs = require('node:fs')
const path = require('node:path')

const allowedTargets = new Set(['dist', 'build'])
const target = process.argv[2]
if (!target || !allowedTargets.has(target)) {
  throw new Error(`拒绝清理未知目录: ${target || '(空)'}`)
}

fs.rmSync(path.join(__dirname, '..', target), { recursive: true, force: true })

'use strict'

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const cwd = path.join(__dirname, '..')
const pfxPath = path.join(cwd, 'build-resources', 'codesign.pfx')
const passwordPath = path.join(cwd, 'build-resources', 'codesign-password.txt')
const builderCmd = path.join(cwd, 'node_modules', '.bin', 'electron-builder.cmd')
const baseArgs = '--win portable --x64 --publish never'

if (!fs.existsSync(pfxPath) || !fs.existsSync(passwordPath)) {
  console.log('未找到代码签名证书，将以未签名形式构建。')
  execSync(`"${builderCmd}" ${baseArgs}`, { stdio: 'inherit', cwd })
  process.exit(0)
}

const password = fs.readFileSync(passwordPath, 'utf8').trim()
process.env.CSC_LINK = pfxPath
process.env.CSC_KEY_PASSWORD = password

console.log('使用代码签名证书:', pfxPath)
execSync(`"${builderCmd}" ${baseArgs}`, { stdio: 'inherit', cwd })
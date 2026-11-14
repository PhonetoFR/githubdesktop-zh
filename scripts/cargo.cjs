'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const rustDir = path.join(root, 'rust')

function exists(file) {
  try {
    return fs.existsSync(file)
  } catch {
    return false
  }
}

function findCargo() {
  if (process.env.CARGO) return process.env.CARGO
  const local = path.join(os.homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo')
  if (exists(local)) return local
  return 'cargo'
}

function findDlltool() {
  if (process.env.DLLTOOL) return process.env.DLLTOOL
  const candidates = [
    process.env.MSYS2_UCRT64_BIN && path.join(process.env.MSYS2_UCRT64_BIN, 'dlltool.exe'),
    'C:\\msys64\\ucrt64\\bin\\dlltool.exe',
    path.join(process.env.TEMP || '', 'opencode', 'msys64', 'ucrt64', 'bin', 'dlltool.exe'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate
  }
  const where = spawnSync('where.exe', ['dlltool'], { encoding: 'utf8' })
  if (where.status === 0) {
    const first = where.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean)
    if (first && exists(first)) return first
  }
  return null
}

const cargo = findCargo()
const dlltool = findDlltool()
const env = { ...process.env }

function hasCommand(name) {
  const where = spawnSync('where.exe', [name], { encoding: 'utf8' })
  return where.status === 0
}

function rustupToolchainExists(name) {
  const rustup = path.join(os.homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'rustup.exe' : 'rustup')
  if (!exists(rustup)) return false
  const list = spawnSync(rustup, ['toolchain', 'list'], { encoding: 'utf8' })
  return list.status === 0 && list.stdout.includes(name)
}

const cargoArgs = []
if (process.platform === 'win32' && !hasCommand('link.exe')) {
  const gnu = '1.99.1-x86_64-pc-windows-gnu'
  if (rustupToolchainExists(gnu)) cargoArgs.push(`+${gnu}`)
}

if (dlltool) {
  const dir = path.dirname(dlltool)
  env.PATH = `${dir};${env.PATH || ''}`
  const version = spawnSync(cargo, [...cargoArgs, '-vV'], { encoding: 'utf8' })
  const host = version.status === 0 ? version.stdout : ''
  if (host.includes('windows-gnu')) {
    env.RUSTFLAGS = `${env.RUSTFLAGS || ''} -Cdlltool=${dlltool}`.trim()
  }
}

const result = spawnSync(cargo, [...cargoArgs, ...process.argv.slice(2)], {
  cwd: rustDir,
  stdio: 'inherit',
  env,
})

if (result.error) {
  console.error(`无法启动 cargo: ${result.error.message}`)
  console.error('请安装 Rust (https://rustup.rs)，或设置 CARGO 环境变量。')
  process.exit(1)
}

process.exit(result.status ?? 1)

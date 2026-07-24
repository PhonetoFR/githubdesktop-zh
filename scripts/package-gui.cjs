'use strict'

const { execSync } = require('node:child_process')
const path = require('node:path')

const cwd = path.join(__dirname, '..')
const builderCmd = path.join(cwd, 'node_modules', '.bin', 'electron-builder.cmd')
const baseArgs = '--win portable --x64 --publish never'

execSync(`"${builderCmd}" ${baseArgs}`, { stdio: 'inherit', cwd })
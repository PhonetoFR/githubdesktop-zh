'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir

  const toRemove = [
    // 纯文本许可证文件，不参与运行时加载
    'LICENSES.chromium.html',
  ]

  let saved = 0
  for (const name of toRemove) {
    const filePath = path.join(appOutDir, name)
    try {
      const stat = fs.statSync(filePath)
      fs.unlinkSync(filePath)
      saved += stat.size
    } catch {
      // 文件不存在则跳过
    }
  }

  const savedMB = (saved / (1024 * 1024)).toFixed(1)
  console.log(`包体精简完成：已移除 ${toRemove.length} 个文件，节省约 ${savedMB} MB`)
}
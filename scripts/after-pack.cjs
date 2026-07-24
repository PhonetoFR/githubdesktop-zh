'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir

  const toRemove = [
    // DirectX / 3D 着色器编译 —— 汉化工具不需要
    'dxcompiler.dll',
    'd3dcompiler_47.dll',
    'dxil.dll',
    // Vulkan 软件渲染 —— 不需要
    'vk_swiftshader.dll',
    'vulkan-1.dll',
    'vk_swiftshader_icd.json',
    // 音视频编解码 —— 不需要
    'ffmpeg.dll',
    // Chromium 第三方许可证（19.4 MB 纯文本）
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
  console.log(`包体精简完成：已移除 ${toRemove.length} 个无用文件，节省约 ${savedMB} MB`)
}
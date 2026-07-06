const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildRuntime } = require('../dist/runtime.js')
const { buildMenuPatch, PATCH_START, PATCH_END } = require('../dist/menu-patch.js')
const { loadDict } = require('../dist/dict.js')
const { getRules } = require('../dist/rules.js')

test('buildRuntime 生成合法 JS（语法校验）', () => {
  const code = buildRuntime(loadDict(), getRules())
  assert.strictEqual(typeof code, 'string')
  // new Function 仅解析函数体，不执行，可捕获语法错误
  assert.doesNotThrow(() => new Function(code), 'runtime 必须是合法 JS')
})

test('buildRuntime 内嵌字典与规则', () => {
  const code = buildRuntime(loadDict(), getRules())
  assert.ok(code.includes('DICT ='), '未嵌入 DICT')
  assert.ok(code.includes('RULES'), '未嵌入 RULES')
  assert.ok(code.includes('MutationObserver'), '未启用 MutationObserver')
})

test('buildRuntime 不泄漏未转义的特殊字符导致语法错误', () => {
  // 含反斜杠、引号、中文的字典/规则不应破坏生成串
  const code = buildRuntime(loadDict(), getRules())
  assert.doesNotThrow(() => new Function(code))
})

test('buildMenuPatch 生成合法 JS 并带标记', () => {
  const code = buildMenuPatch(loadDict())
  assert.strictEqual(typeof code, 'string')
  assert.ok(code.startsWith(PATCH_START), '缺少起始标记')
  assert.ok(code.includes(PATCH_END), '缺少结束标记')
  assert.doesNotThrow(() => new Function(code), 'menu-patch 必须是合法 JS')
})

test('buildMenuPatch 内嵌字典', () => {
  const code = buildMenuPatch(loadDict())
  assert.ok(code.includes('DICT ='), 'menu-patch 未嵌入 DICT')
  assert.ok(code.includes('buildFromTemplate'), '未劫持 buildFromTemplate')
})

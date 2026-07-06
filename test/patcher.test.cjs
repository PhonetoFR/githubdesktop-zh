const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isDesktopRunning } = require('../dist/patcher.js')

test('isDesktopRunning 返回布尔值且不抛异常', () => {
  const result = isDesktopRunning()
  assert.strictEqual(typeof result, 'boolean')
})

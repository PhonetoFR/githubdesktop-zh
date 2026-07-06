const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dictPath = path.join(__dirname, '..', 'dict', 'zh-CN.json')
const { loadDict, validateDict } = require('../dist/dict.js')

// 文本级重复键检测：JSON.parse 会静默合并重复键，validateDict 抓不到，
// 因此直接扫源文件文本。
test('字典文本级无重复键', () => {
  const txt = fs.readFileSync(dictPath, 'utf8')
  const keys = []
  const re = /^\s*"([^"]+)"\s*:/gm
  let m
  while ((m = re.exec(txt))) keys.push(m[1])
  const seen = new Set()
  const dups = new Set()
  for (const k of keys) {
    if (seen.has(k)) dups.add(k)
    else seen.add(k)
  }
  assert.deepStrictEqual([...dups], [], `重复键: ${[...dups].join(', ')}`)
  assert.ok(keys.length > 400, `字典条目过少: ${keys.length}`)
})

test('字典无空键或空值', () => {
  const d = JSON.parse(fs.readFileSync(dictPath, 'utf8'))
  for (const [k, v] of Object.entries(d)) {
    assert.ok(k, '存在空键')
    assert.strictEqual(typeof v, 'string', `键 "${k}" 的值非字符串`)
    assert.ok(v.length > 0, `键 "${k}" 的值为空`)
  }
})

test('loadDict 通过校验并返回对象', () => {
  const d = loadDict()
  assert.strictEqual(typeof d, 'object')
  assert.notStrictEqual(d, null)
  assert.ok(Object.keys(d).length > 400)
})

test('validateDict 对当前字典不抛异常', () => {
  validateDict(loadDict())
})

test('字典值中不含未翻译的占位符', () => {
  const d = loadDict()
  for (const [k, v] of Object.entries(d)) {
    assert.ok(!/\{.*\}/.test(v), `键 "${k}" 的值疑似含占位符: ${v}`)
  }
})

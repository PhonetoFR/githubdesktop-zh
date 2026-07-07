const { test } = require('node:test')
const assert = require('node:assert/strict')
const { getRules } = require('../dist/rules.js')
const { loadDict } = require('../dist/dict.js')

// 复刻 runtime.ts 中 translate() 的语义：先精确字典，再正则规则。
function makeTranslator() {
  const dict = loadDict()
  const rules = getRules().map(r => ({
    p: new RegExp(r.pattern, r.flags),
    repl: r.replacement,
  }))
  return function translate(text) {
    const tr = text.trim()
    if (Object.prototype.hasOwnProperty.call(dict, tr)) return dict[tr]
    for (const r of rules) {
      if (r.p.test(tr)) return tr.replace(r.p, r.repl)
    }
    return text
  }
}

const translate = makeTranslator()

const positives = [
  ['5 commits ahead', '5 个提交领先'],
  ['1 commit ahead', '1 个提交领先'],
  ['3 commits behind', '3 个提交落后'],
  ['5 commits ahead, 2 commits behind', '5 个提交领先，2 个提交落后'],
  ['Pushed 3 commits', '已推送 3 个提交'],
  ['Pushed 1 commit', '已推送 1 个提交'],
  ['Pulled 1 commit', '已拉取 1 个提交'],
  ['Pulled 2 commits', '已拉取 2 个提交'],
  ['Created branch feature-x', '已创建分支 feature-x'],
  ['Deleted branch old', '已删除分支 old'],
  ['12 commits', '12 个提交'],
  ['5 additions', '5 处新增'],
  ['1 addition', '1 处新增'],
  ['5 deletions', '5 处删除'],
  ['1 deletion', '1 处删除'],
  ['3 hours ago', '3 小时前'],
  ['2 days ago', '2 天前'],
  ['5 weeks ago', '5 周前'],
  ['2 months ago', '2 个月前'],
  ['1 year ago', '1 年前'],
  ['Last fetched 2 days ago', '2 天前已获取'],
  ['Last fetched 30 seconds ago', '30 秒前已获取'],
  ['Last fetched just now', '刚刚获取'],
  ['Last fetched 5 minutes ago', '5 分钟前已获取'],
  ['Last fetched 2 hours ago', '2 小时前已获取'],
  ['Commit to main', '提交到 main'],
  ['7 changed files', '7 个已更改文件'],
  ['1 changed file', '1 个已更改文件'],
  ['Push 3 commits', '推送 3 个提交'],
  ['Pull 1 commit', '拉取 1 个提交'],
  ['Open in VS Code', '在 VS Code 中打开'],
  ['Update from upstream', '从 upstream 更新'],
  ['2 suggestions', '2 条建议'],
  ['5 checks failed in your pull request', '你的拉取请求中有 5 个检查失败'],
  ['1 check failed in your pull request', '你的拉取请求中有 1 个检查失败'],
  ['Rename main', '重命名 main'],
  ['Leave my changes on feature-x', '把我的更改留在 feature-x'],
  ['Bring my changes to dev', '把我的更改带到 dev'],
  ['Version 3.4.0', '版本 3.4.0'],
  ['Fetch the latest changes from upstream', '从 upstream 获取最新更改'],
  ['Fetch upstream', '获取 upstream'],
  ['Force push main', '强制推送 main'],
  ['Overwrite any changes on main with your local changes', '用你的本地更改覆盖 main 上的所有更改'],
  ['5 added lines', '5 行新增'],
  ['1 removed line', '1 行移除'],
  ['Merge 3 commits into', '将 3 个提交合并到'],
  ['Merge 1 commit into', '将 1 个提交合并到'],
  ['Why are you bypassing this GitHub Token?', '为什么绕过 GitHub Token？'],
]

test('规则正确翻译已知动态字符串', () => {
  for (const [input, expected] of positives) {
    assert.strictEqual(translate(input), expected, `输入: ${input}`)
  }
})

const negatives = [
  'random english sentence',
  '5 random things',
  'commits ahead',
  'Last fetched',
  'ahead of main',
]

test('规则不误匹配无关字符串', () => {
  for (const input of negatives) {
    assert.strictEqual(translate(input), input, `不应翻译: ${input}`)
  }
})

test('字典优先于规则（1 commit 在字典中）', () => {
  assert.strictEqual(translate('1 commit'), '1 个提交')
})

test('每条规则都是合法 RegExp', () => {
  for (const r of getRules()) {
    assert.doesNotThrow(() => new RegExp(r.pattern, r.flags), `非法正则: ${r.pattern}`)
  }
})

test('规则数量符合预期（≥25）', () => {
  assert.ok(getRules().length >= 25, `规则数: ${getRules().length}`)
})

test('Last fetched 兜底规则排在所有 Last fetched 具体规则之后', () => {
  const rules = getRules()
  const fallbackIdx = rules.findIndex(r => r.pattern === '^Last fetched (.+)$')
  assert.notStrictEqual(fallbackIdx, -1, '缺少兜底规则')
  for (let i = 0; i < fallbackIdx; i++) {
    if (rules[i].pattern.startsWith('^Last fetched')) {
      assert.notStrictEqual(rules[i].pattern, '^Last fetched (.+)$', '兜底规则重复')
    }
  }
})

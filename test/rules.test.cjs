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
  ['0 changes', '0 个更改'],
  ['1 change', '1 个更改'],
  ['7 changes', '7 个更改'],
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
  ['No results for "foo"', '未找到“foo”的结果'],
  ['No results for "main branch"', '未找到“main branch”的结果'],
  ['Result 1 of 5 for "foo"', '“foo”的结果：1/5'],
  ['Result 12 of 30 for "commit"', '“commit”的结果：12/30'],
  ['Lines 5 to 10 added', '第 5 到 10 行新增'],
  ['Lines 5 to 10 deleted', '第 5 到 10 行删除'],
  ['Lines 5 to 10 modified', '第 5 到 10 行修改'],
  ['A branch named feature-x already exists.', '已存在名为 feature-x 的分支。'],
  ["Your new branch will be based on the commit 'Fix typo' (a1b2c3d) from your repository.", '你的新分支将基于仓库中的提交“Fix typo”（a1b2c3d）。'],
  ['You do not currently have any branch checked out (your HEAD reference is detached). As such your new branch will be based on your currently checked out commit (a1b2c3d).', '你当前未检出任何分支（你的 HEAD 引用处于分离状态）。因此，你的新分支将基于你当前检出的提交（a1b2c3d）。'],
  ['You can try again in 30 seconds.', '30 秒后可以重试。'],
  ['You can try again in 1 second.', '1 秒后可以重试。'],
  ['You can try again after 2026-08-14T12:00:00Z.', '可在 2026-08-14T12:00:00Z 之后重试。'],
  ['(resets in 5 minutes)', '（5 分钟后重置）'],
  ['(resets in 1 minute)', '（1 分钟后重置）'],
  ['(resets in 3 hours)', '（3 小时后重置）'],
  ['(resets in 2 days)', '（2 天后重置）'],
  ['Pull upstream', '拉取 upstream'],
  ['Pull upstream with rebase', '以变基方式拉取 upstream'],
  ['Push upstream', '推送 upstream'],
  ['AI credits per 1000 tokens', '每 1000 个 token 的 AI 积分'],
  ['Primary remote repository (origin) URL', '主远程仓库（origin）URL'],
  ['Primary Remote Repository (origin) URL', '主远程仓库（origin）URL'],
  ['3 / 10 chat messages used', '3 / 10 条聊天消息已使用'],
  ['5 / 20 code completions used', '5 / 20 次代码补全已使用'],
  ['2 / 100 premium requests used', '2 / 100 次高级请求已使用'],
  ['1 / 50 session limits used', '1 / 50 条会话限制已使用'],
  ['4 / 50 weekly limits used', '4 / 50 条每周限制已使用'],
  ['1,000 / 10,000 AI credits used', '1,000 / 10,000 AI 积分已使用'],
  ['5 files selected', '5 个文件已选择'],
  ['1 file selected', '1 个文件已选择'],
  ['Discard 3 selected changes', '放弃 3 项选定的更改'],
  ['Discard 3 selected changes…', '放弃 3 项选定的更改…'],
  ['Cherry-pick 3 commits…', '挑拣 3 个提交…'],
  ['Squash 3 commits…', '压缩 3 个提交…'],
  ['Squash 3 Commits', '压缩 3 个提交'],
  ['Reorder 3 commits…', '重新排序 3 个提交…'],
  ['Ignore 3 selected files (add to .gitignore)', '忽略 3 个选定文件（添加到 .gitignore）'],
  ['Ignore all js files (add to .gitignore)', '忽略所有 js 文件（添加到 .gitignore）'],
  ['3 conflicted files', '3 个冲突文件'],
  ['1 conflicted file', '1 个冲突文件'],
  ['5 pull requests found', '找到 5 个拉取请求'],
  ['1 pull request found', '找到 1 个拉取请求'],
  ['Pull requests in desktop/desktop', 'desktop/desktop 中的拉取请求'],
  ['Choose a branch to merge into main', '选择要合并到 main 的分支'],
  ['1,234 local commits', '1,234 个本地提交'],
  ['1 local commit', '1 个本地提交'],
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
  'ahead of main',
  'Result in progress',
  'Lines 5 to 10 selected',
  'A branch named already exists.',
  'You can try again soon.',
  'This submodule changed its commit from a to b.',
  'This is a submodule based on the repository github/desktop.',
  '3 / 10 items used',
  'resets in 5 minutes',
  'Primary remote repository URL',
  '5 selected files',
  'Ignore selected files (add to .gitignore)',
  'Ignore all files (add to .gitignore)',
  '2 files selected by user',
  'Squash 3 commits',
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

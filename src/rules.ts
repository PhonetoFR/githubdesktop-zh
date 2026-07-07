export interface Rule {
  pattern: string
  flags: string
  replacement: string
}

export function getRules(): Rule[] {
  return [
    {
      pattern: '^Last fetched (\\d+) minutes? ago$',
      flags: '',
      replacement: '$1 分钟前已获取',
    },
    {
      pattern: '^Last fetched (\\d+) hours? ago$',
      flags: '',
      replacement: '$1 小时前已获取',
    },
    {
      pattern: '^Last fetched just now$',
      flags: '',
      replacement: '刚刚获取',
    },
    {
      pattern: '^Commit to (.+)$',
      flags: '',
      replacement: '提交到 $1',
    },
    {
      pattern: '^(\\d+) changed files?$',
      flags: '',
      replacement: '$1 个已更改文件',
    },
    {
      pattern: '^(\\d+) unstaged files?$',
      flags: '',
      replacement: '$1 个未暂存文件',
    },
    {
      pattern: '^Push (\\d+) commits?$',
      flags: '',
      replacement: '推送 $1 个提交',
    },
    {
      pattern: '^Pull (\\d+) commits?$',
      flags: '',
      replacement: '拉取 $1 个提交',
    },
    {
      pattern: '^Open in (.+)$',
      flags: '',
      replacement: '在 $1 中打开',
    },
    {
      pattern: '^Update from (.+)$',
      flags: '',
      replacement: '从 $1 更新',
    },
    {
      pattern: '^(\\d+) commits? ahead$',
      flags: '',
      replacement: '$1 个提交领先',
    },
    {
      pattern: '^(\\d+) commits? behind$',
      flags: '',
      replacement: '$1 个提交落后',
    },
    {
      pattern: '^(\\d+) commits? ahead, (\\d+) commits? behind$',
      flags: '',
      replacement: '$1 个提交领先，$2 个提交落后',
    },
    {
      pattern: '^Pushed (\\d+) commits?$',
      flags: '',
      replacement: '已推送 $1 个提交',
    },
    {
      pattern: '^Pulled (\\d+) commits?$',
      flags: '',
      replacement: '已拉取 $1 个提交',
    },
    {
      pattern: '^Created branch (.+)$',
      flags: '',
      replacement: '已创建分支 $1',
    },
    {
      pattern: '^Deleted branch (.+)$',
      flags: '',
      replacement: '已删除分支 $1',
    },
    {
      pattern: '^(\\d+) commits?$',
      flags: '',
      replacement: '$1 个提交',
    },
    {
      pattern: '^(\\d+) additions?$',
      flags: '',
      replacement: '$1 处新增',
    },
    {
      pattern: '^(\\d+) deletions?$',
      flags: '',
      replacement: '$1 处删除',
    },
    {
      pattern: '^(\\d+) hours? ago$',
      flags: '',
      replacement: '$1 小时前',
    },
    {
      pattern: '^(\\d+) days? ago$',
      flags: '',
      replacement: '$1 天前',
    },
    {
      pattern: '^(\\d+) weeks? ago$',
      flags: '',
      replacement: '$1 周前',
    },
    {
      pattern: '^(\\d+) months? ago$',
      flags: '',
      replacement: '$1 个月前',
    },
    {
      pattern: '^(\\d+) years? ago$',
      flags: '',
      replacement: '$1 年前',
    },
    {
      pattern: '^Last fetched (\\d+) days? ago$',
      flags: '',
      replacement: '$1 天前已获取',
    },
    {
      pattern: '^Last fetched (\\d+) seconds? ago$',
      flags: '',
      replacement: '$1 秒前已获取',
    },
    {
      pattern: '^Last fetched (.+)$',
      flags: '',
      replacement: '上次获取于 $1',
    },
    {
      pattern: '^(\\d+) suggestions?$',
      flags: '',
      replacement: '$1 条建议',
    },
    {
      pattern: '^(\\d+) checks? failed in your pull request$',
      flags: '',
      replacement: '你的拉取请求中有 $1 个检查失败',
    },
  ]
}

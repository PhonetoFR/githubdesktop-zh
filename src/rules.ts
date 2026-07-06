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
      pattern: '^Last fetched (.+)$',
      flags: '',
      replacement: '上次获取于 $1',
    },
  ]
}

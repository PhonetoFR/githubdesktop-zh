# AGENTS.md — GitHub Desktop 汉化补丁 开发交接

> 本文件供 opencode 自动读取。新机器接手前先读完本文,再动手。

## 1. 项目是什么

Windows 图形化 GitHub Desktop 简体中文补丁工具。默认发行形式为免安装 Electron portable EXE,同时保留独立 CLI 构建。

**原理**:在 GitHub Desktop 的 `index.html` 中加载 `zh/runtime.js`,并修改 `main.js` 劫持 `Menu.buildFromTemplate`。运行时用 MutationObserver 监听 DOM,把英文文本节点和 `aria-label/title/placeholder/alt` 属性精确替换为中文。原文件备份为 `.bak`,补丁和还原失败时自动回滚。

- 仓库:`https://github.com/PhonetoFR/githubdesktop-zh`
- 默认分支:`master`
- 许可:MIT
- 当前版本:`1.1.0-beta.3`(GUI portable beta)

## 2. 当前状态(2026-07-24 截止)

| 维度 | 数值 |
|---|---|
| 字典条目 `dict/zh-CN.json` | 1307 |
| 动态规则 `src/rules.ts` | 43 |
| 单元测试 `test/*.test.cjs` | 33(全过) |
| 版本 | 1.1.0-beta.3 |
| 默认产物 | `github-desktop-zh-1.1.0-beta.3-portable.exe`(约 89.6MB) |
| 远端 origin | `https://github.com/PhonetoFR/githubdesktop-zh.git` |

GUI 已在 Windows 上完成 portable 启动、状态读取、汉化和还原闭环实测。测试目标为 GitHub Desktop 3.6.3,还原后源文件与 `.bak` 一致且 `zh/runtime.js` 已删除。

## 3. 架构(文件地图)

```
src/
├── gui-main.ts    Electron 主进程、BrowserWindow、安全 IPC
├── gui-preload.ts contextBridge 窄接口
├── gui-contract.ts GUI IPC 数据类型
├── application.ts CLI/GUI 共用的操作编排与安全检查
├── main.ts        保留的 CLI 入口(--patch/--restore/--status)
├── patcher.ts     补丁状态、备份、事务写入、回滚、还原
├── locator.ts     查找 Windows GitHub Desktop 安装路径
├── runtime.ts     buildRuntime(dict,rules) → zh/runtime.js
├── menu-patch.ts  buildMenuPatch(dict) → 注入到 main.js 的 IIFE 源串(劫持 Menu.buildFromTemplate)
├── rules.ts       getRules() → 动态文本正则规则数组
├── dict.ts        loadDict()/validateDict()(运行时校验重复键/空值)
├── prompt.ts      交互式菜单 UI
└── log.ts         日志
gui/               原生 HTML/CSS/JS 界面资源
scripts/           构建清理与图标生成脚本
dict/zh-CN.json    精确翻译字典(运行时 trim 后大小写敏感全等匹配)
test/*.test.cjs    node:test 单元测试(零依赖,require ../dist/)
```

**注入产物**:patch 时在安装目录建 `zh/runtime.js`(翻译运行时),并在 `index.html` 加 `<script defer src="zh/runtime.js">`,在 `main.js` 顶部注入 `/*ZH-PATCH*/.../*END-ZH-PATCH*/`。

## 4. 常用命令

```bash
npm run build      # tsc 编译 src/ → dist/
npm test           # build + node --test test/*.test.cjs(改字典/规则后必跑)
npm run dev        # 构建并启动 Electron GUI
npm run package    # electron-builder portable → build/*-portable.exe
npm run package:cli # 可选:pkg 打包 → build/patch-cli.exe
npm run lint       # eslint(需先 npm install;node_modules 未装时不可用)
```

### 必读 gotcha
- **GUI 固定为 portable**:`package.json` 的 electron-builder target 只有 `portable`,不生成 MSI/NSIS 安装器。启动时临时解包,关闭后清理。
- **不要给 GUI 打包设置 `CI=true`**:electron-builder 会把 CI 环境解释为自动发布。脚本已显式带 `--publish never`。
- **CLI 才需要 `CI=true`**:pkg 5.8.1 在新版 Node 上可能触发进度条断言,用 `CI=true npm run package:cli`。
- **测试先 build**:`test/*.test.cjs` require `../dist/`,所以 `npm test` 内含 `npm run build`。直接 `node --test` 不行。
- **构建自动清理**:`npm run build` 先删除 `dist`;打包前删除 `build`,避免旧文件进入产物或被误上传。
- **产物未代码签名**:当前 portable EXE 的 Authenticode 状态为 `NotSigned`,Windows 可能显示 SmartScreen 提示。

## 5. 翻译运行时语义(改字典/规则必读)

- 匹配流程:`translate(text)` → trim → 若含 CJK 直接返回 → **先查字典精确全等**(大小写敏感)→ 再按顺序试 rules 正则 → 都不中返回原文。
- **字典 key 必须是界面上实际出现的完整独立字符串**,不能是句子片段、不能含 `{0}/{n}/%s` 占位符(那是 rules 的领域)。
- **双大小写**:GitHub Desktop 常用 `__DARWIN__ ? 'Title Case' : 'sentence case'`。macOS 渲染 Title Case,Win/Linux 渲染 sentence case。**两种各收一条**(如 `"Open repository"` 和 `"Open Repository"`)。
- 省略号是真 `…`(U+2026),不是 `...`。撇号区分直 `'`(U+0027)与弯 `'`(U+2019),以源码为准原样保留。
- `tryTranslateContainer` 只处理「无元素子节点」的叶子容器(长度 4–200),所以跨内联元素的句子(`<span>N <em>commits</em></span>`)会漏。

## 6. 翻译术语规范(GitHub 中文文档惯例)

Repository→仓库, Branch→分支, Commit→提交, Pull Request→拉取请求, Fork→复刻, Stash→暂存, Rebase→变基, Cherry pick→挑拣, Merge→合并, Push→推送, Pull→拉取, Fetch→获取, Clone→克隆, Checkout→检出, Squash→压缩, Tag→标签, Issue→议题, Remote→远端, Worktree→工作树, Diff→差异, Amend→修订, Discard→放弃, Conflict→冲突, LFS→LFS(保留), Copilot→Copilot(保留), Azure/Anthropic/OpenAI 等专名保留原文。

## 7. 如何扩字典(挖字符串)

上游源码:`https://github.com/desktop/desktop`,分支 `development`。
- 目录列表 API:`https://api.github.com/repos/desktop/desktop/contents/app/src/ui/<dir>?ref=development`
- 原始文件:`https://raw.githubusercontent.com/desktop/desktop/development/app/src/ui/<file>`
- raw 服务器有 **429 限流**,遇限流换目录 API 的 `download_url` 或抓其他文件。
- 字符串形态:`<Trans>文本</Trans>`、`gettext('...')`、JSX 文本、`aria-label/title/placeholder`、按钮 `label` 字面量。
- 排除:console 日志、测试、注释、内部 id、CSS 类、纯符号、过短短歧义词。

### 合并前必须做文本级碰撞检测
`validateDict`(运行时)用 `JSON.parse` 会**静默合并重复键**,抓不到文本级 dup。合并新条目前用脚本检测:

```bash
node -e "
const fs=require('fs');
const cur=JSON.parse(fs.readFileSync('dict/zh-CN.json','utf8'));
const batch=JSON.parse(fs.readFileSync('/tmp/batch.json','utf8'));
const ck=new Set(Object.keys(cur));const s=new Set();const dup=[],col=[];
for(const e of batch){if(s.has(e.en))dup.push(e.en);s.add(e.en);if(ck.has(e.en))col.push(e.en);}
console.log('batch:',batch.length,'internalDup:',dup,'collide:',col);"
```

现有字典文件格式 = `JSON.stringify(obj,null,2)+'\n'`,**可安全整体重生成**(diff 最小)。合并推荐用脚本:`读现有 → Object.assign 追加 → 文本级 dup 扫描 → JSON.stringify 写回`。

### 已挖过的组件(勿重复)
changes、diff(文本)、history、branches、merge-conflicts、multi-commit-operation、clone-repository、add-repository、create-branch、create-tag、delete-branch、delete-tag、discard-changes、no-repositories、banners、check-runs、lfs、forks、local-changes-overwritten、hook-failed、missing-repository、install-git、invalidated-token、generic-git-auth、cli-installed、change-repository-alias、choose-fork-settings、cloning-repository、commit-progress、commit-message、about、acknowledgements、account-picker、editor、stashing、rebase、cherry-pick、pull-request-preview、copilot、move-to-applications-folder、cli-action、image-diffs。

### 仍可挖(batch 4 候选)
`autocompletion`(提及/emoji)、`keyboard-shortcut`(快捷键对话框)、`diff/syntax-highlighting`、`checkout`、`app-error`、`notifications` 正文、`create-branch`/`commit-message` 遗漏项、`pull-request-preview` 遗漏项。

## 8. 如何扩动态规则(`src/rules.ts`)

- 每条 `{pattern, flags, replacement}`,pattern 用 `^…$` 锚定,replacement 用 `$1/$2` 引用捕获组。
- **顺序重要**:catch-all 兜底规则(如 `^Last fetched (.+)$`)必须排在具体规则(分钟/小时/天)之后,否则吃掉所有。
- 含变量插值的句子(`Pushed {n} commits`)用规则,不用字典。
- 加规则后跑 `npm test`,新增正例加进 `test/rules.test.cjs`。

## 9. 发布流程(Release)

1. 同步修改 `package.json` 与 `package-lock.json` 根版本 → commit → push。
2. `npm run package` 生成 `build/github-desktop-zh-<version>-portable.exe`。
3. `git tag -a vx.y.z -m "vx.y.z" && git push origin vx.y.z`。
4. beta 使用 `gh release create ... --prerelease`;正式版才使用 `--latest`。
5. 约 90MB 资产上传需使用长超时。
6. 验证:`gh release view vx.y.z --json isDraft,isPrerelease,assets`。

## 10. 路线图(按风险分级)

### 已完成
- GUI portable EXE,原生 HTML/CSS/JS 界面
- Electron sandbox/contextIsolation/contextBridge 与 IPC sender 校验
- 共享 application service,CLI 功能保留
- 补丁/还原事务回滚和所有权保护
- 字典 1307 条、动态规则 43 条、测试 33 项

### 安全可做(纯数据/增量,本机可验证)
- 字典 batch 4(见第 7 节候选)
- 补 rules 新正例 + 对应测试

### 有风险(改注入运行时,本机无法验证,需 Windows 实测)
- **菜单覆盖 `new MenuItem()`**(`src/menu-patch.ts`):现只劫持 `Menu.buildFromTemplate`。补 `MenuItem` 构造器 hook 可覆盖右键菜单,但写错会崩整个应用菜单。注意 `role`-based 菜单项(undo/redo/copy)无 `label` 字段,由 OS 本地化,不要碰。
- **升级后自动重打补丁**:Squirrel 升级建新 `app-x.y.z` 目录致汉化失效。当前 GUI 会显示新版本,需用户重新点击汉化。
- **runtime 跨元素容器翻译**(`src/runtime.ts:tryTranslateContainer`):改 `textContent` 可能与 React 虚拟 DOM 冲突导致重渲染异常。
- **跨平台**:GUI 和安装定位当前明确只支持 Windows x64。

### 已知小瑕疵(可选修)
- Electron portable 约 89.6MB,明显大于旧 pkg CLI 的约 38MB。
- `pkg@5.8.1` 仅用于可选 CLI,存在无上游修复的本地权限提升 advisory;GUI 生产依赖审计为 0。

## 11. 环境与认证

- 开发机:Windows 11,已安装 GitHub Desktop,可做真实 GUI/补丁回归。
- `gh auth` 已登录账号 `PhonetoFR`,Git 协议为 HTTPS。
- GUI portable 已在本机实测;每次改 IPC、打包路径或 patcher 后仍需重复汉化/还原闭环。

## 12. 提交约定

- Conventional commits:`feat:` / `fix:` / `chore:` / `docs:` / `test:`。
- 字典扩充提交信息带条目数变化,如 `feat: expand dictionary batch 4 (...771→8xx)`。
- 不主动 commit/push 除非用户明确要求(本会话用户已授权「每次改完 commit 并 push」)。

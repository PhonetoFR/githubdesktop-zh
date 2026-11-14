# AGENTS.md — GitHub Desktop 汉化补丁 开发交接

> 本文件供 opencode 自动读取。新机器接手前先读完本文,再动手。

## 1. 项目是什么

Windows 图形化 GitHub Desktop 简体中文补丁工具。v1.2.0 起桌面端已从 Electron 迁移到 **Rust + Rune**，产物为单文件原生 EXE（约 16 MB），保留 CLI。

**原理**:在 GitHub Desktop 的 `index.html` 中加载 `zh/runtime.js`，并修改 `main.js` 注入菜单补丁（劫持 `Menu.buildFromTemplate`）。运行时用 MutationObserver 监听 DOM，把英文文本节点和 `aria-label/title/placeholder/alt` 替换为中文。原文件备份为 `.bak`，补丁和还原失败时自动回滚。

Rune 只替换桌面壳和补丁器；翻译字典、动态规则、`runtime.js` 与菜单补丁仍然生成 JavaScript 注入 GitHub Desktop。

- 仓库:`https://github.com/PhonetoFR/githubdesktop-zh`
- 默认分支:`master`
- 许可:MIT
- 当前版本:`1.2.0`（Rune 原生版）

## 2. 当前状态(2026-11-14 截止)

| 维度 | 数值 |
|---|---|
| 字典条目 `dict/zh-CN.json` | 1476 |
| 动态规则 `src/rules.ts` | 82 |
| 桌面框架 | Rune（git rev `4970cffe6a4e90c7d613796be8ce39eb3dcb281b`） |
| 单元测试 | 23 项 Node + 12 项 Rust（全过） |
| 版本 | 1.2.0 |
| 默认产物 | `build/github-desktop-zh-1.2.0-portable.exe`（16.14 MB） |
| 实测启动 | 约 0.30 秒（release；首次签名后可能被杀毒扫描拖慢） |
| 实测内存 | 约 13 MB 工作集 |
| 远端 origin | `https://github.com/PhonetoFR/githubdesktop-zh.git` |

已在 Windows 11 + GitHub Desktop 3.6.4 上完成 Rust CLI 与 GUI 的汉化/还原闭环，并验证 GitHub Desktop 3.6.4 界面为中文。3.6.3/3.6.4 的 renderer/main 字符串集合一致，仅 User-Agent 版本号不同。

## 3. 架构(文件地图)

```
rust/
├── Cargo.toml        Rune git 依赖 + 官方 patch 路径
├── rust-toolchain.toml 固定 1.99.1
├── src/
│   ├── main.rs      CLI 入口 + GUI 启动
│   ├── ui.rs        Rune 界面（Card/Button/Select/Badge/Spinner/IconButton）
│   ├── application.rs 目标选择、运行状态拦截、操作编排
│   ├── patcher.rs   状态/备份/事务写入/回滚/还原/进程检测
│   ├── install.rs   安装目录扫描、版本排序
│   ├── assets.rs    嵌入 runtime/menu-patch/manifest/icon
│   ├── platform.rs  打开项目主页
│   └── error.rs     AppError
├── assets/          由 Node 生成并提交
│   ├── runtime.js
│   ├── menu-patch.txt
│   ├── manifest.json
│   └── icon.png
├── vendor/          Rune 官方 patch 副本（wgpu-hal/winit/parley_engine/accesskit_windows）
└── tests/           Rust 补丁器测试
src/
├── dict.ts          loadDict/validateDict
├── rules.ts         82 条动态规则
├── runtime.ts       buildRuntime(dict,rules) → runtime.js
└── menu-patch.ts    buildMenuPatch(dict,rules) → 菜单 IIFE
scripts/
├── build-rune-assets.cjs  生成 rust/assets 并支持 --check
├── cargo.cjs              定位 cargo/rustup/msys2，GNU 时注入 dlltool
├── package-rune.cjs       rcedit 写图标/版本 + signtool 签名
└── generate-cert.cjs      自签名证书
dict/zh-CN.json     精确翻译字典
test/*.test.cjs     Node 测试（字典/规则/资产/GUI 配置）
```

**注入产物**:patch 时在安装目录建 `zh/runtime.js`，`index.html` 加 `<script defer src="zh/runtime.js">`，`main.js` 顶部注入 `/*ZH-PATCH*/.../*END-ZH-PATCH*/`。

## 4. 常用命令

```bash
npm install
npm run build:rune-assets   # tsc + 生成 rust/assets
npm run dev                 # 生成资产并启动 Rust GUI（debug）
npm run build:rune          # release 构建
npm run package             # 写图标/版本、签名、复制到 build/
npm test                    # Node 测试 + 资产一致性
npm run test:rune           # Rust 测试
npm run test:all
npm run lint                # eslint src/**/*.ts
```

### 必读 gotcha

- **Rust 工具链固定 1.99.1**（`rust/rust-toolchain.toml`）。本机是 GNU 工具链；`scripts/cargo.cjs` 检测不到 `link.exe` 时自动改用 `1.99.1-x86_64-pc-windows-gnu`。
- **GNU 构建需要 MSYS2 UCRT64 binutils**：`dlltool.exe` 必须在 PATH，脚本会尝试 `C:\msys64\ucrt64\bin` 与 `%TEMP%\opencode\msys64\ucrt64\bin`。MSVC 构建不需要。
- **Rune 必须带官方 patch**：`rust/vendor/` 中的 `wgpu-hal`/`winit`/`parley_engine`/`accesskit_windows` 不能删；`wgpu-hal` 的 `expose_adapter` 是 Windows 编译必需。
- **改字典或规则后必须运行 `npm run build:rune-assets`**，并提交 `rust/assets/*`。`npm test` 会跑 `--check` 阻止资产过期。
- **不要用 winres 写 Windows 资源**：GNU `ld` 只会保留一个 `.rsrc`，会丢掉版本/图标。改用 `rcedit`（`package-rune.cjs`）。
- **不要打印资产体积用字符数**：`runtime.js` 约 99 KB UTF-8、75 K 字符；测试用 `Buffer.byteLength`。
- **单实例**：`rune::single_instance` 返回 `false` 时必须直接 return，否则第二个进程会留下不可见窗口。
- **补丁操作在后台线程**：`start_action` 用 `mpsc` + `poll` 回传结果，遵守 Rune “帧循环内不做文件 I/O”的约束。
- **高 DPI 截图**：PowerShell 默认 DPI 虚拟化，截图必须 `SetProcessDpiAwarenessContext(-4)`，否则只截到左上角。
- **Rune 的 `Color::hex` 是实例方法**：解析十六进制用 `rune::color::hex("#rrggbb")`。
- **Rune `El` 没有 `.p()`**：用 `.padding(x)` 或 `.px/.py/.pt/.pb/.pl/.pr`。
- **Rune `scroll()` 需要参数**：`El::scroll(ScrollSpec { stick_bottom: false })`。
- **运行时图标**：`rune::set_app_icon` 管窗口/任务栏图标；EXE 资源图标由 `rcedit` 写。

## 5. 翻译运行时语义(改字典/规则必读)

- 匹配流程:`translate(text)` → trim → 若含 CJK 直接返回 → **先查字典精确全等**（大小写敏感）→ 再按顺序试 rules 正则 → 都不中返回原文。
- **字典 key 必须是界面上实际出现的完整独立字符串**，不能是句子片段、不能含 `{0}/{n}/%s` 占位符（那是 rules 的领域）。
- **双大小写**:GitHub Desktop 常用 `__DARWIN__ ? 'Title Case' : 'sentence case'`。macOS 渲染 Title Case，Win/Linux 渲染 sentence case。**两种各收一条**。
- 省略号是真 `…`（U+2026），不是 `...`。撇号区分直 `'`（U+0027）与弯 `’`（U+2019），以源码为准原样保留。
- `tryTranslateContainer` 只处理「无元素子节点」的叶子容器（长度 4–200），跨内联元素的句子会漏。
- 运行时会把相邻 2–3 个文本节点合并后再翻译，`N files selected` 这类拆分文本可以命中规则。

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

```bash
node -e "
const fs=require('fs');
const cur=JSON.parse(fs.readFileSync('dict/zh-CN.json','utf8'));
const batch=JSON.parse(fs.readFileSync('/tmp/batch.json','utf8'));
const ck=new Set(Object.keys(cur));const s=new Set();const dup=[],col=[];
for(const e of batch){if(s.has(e.en))dup.push(e.en);s.add(e.en);if(ck.has(e.en))col.push(e.en);}
console.log('batch:',batch.length,'internalDup:',dup,'collide:',col);"
```

现有字典格式 = `JSON.stringify(obj,null,2)+'\n'`，可整体重生成。合并推荐：读现有 → Object.assign 追加 → 文本级 dup 扫描 → 写回。

### 已挖过的组件(勿重复)
changes、diff(文本)、history、branches、merge-conflicts、multi-commit-operation、clone-repository、add-repository、create-branch、create-tag、delete-branch、delete-tag、discard-changes、no-repositories、banners、check-runs、lfs、forks、local-changes-overwritten、hook-failed、missing-repository、install-git、invalidated-token、generic-git-auth、cli-installed、change-repository-alias、choose-fork-settings、cloning-repository、commit-progress、commit-message、about、acknowledgements、account-picker、editor、stashing、rebase、cherry-pick、pull-request-preview、copilot、move-to-applications-folder、cli-action、image-diffs。
batch 4 已挖:autocompletion、keyboard-shortcut、notifications、app-error、checkout、diff/syntax-highlighting、submodule-diff、open-pull-request。
batch 5 已挖:app-menu、preferences、copilot、repository-settings、toolbar、undo、app.tsx、lib、dialog。
batch 6 已挖:release-3.6.4 全量静态扫描（关于/偏好、发布仓库、多选右键、Copilot 冲突解决、教程、无障碍），修正 3 处弯引号死键、1 处标点、删除 1 条 `Pull requests in` 片段键。

### 仍可挖(batch 7 候选)
`publish-repository`、`push-needs-pull`、`repository-rules`、`suggested-actions`、`welcome`、`terms-and-conditions`、`installing-update`、`release-notes`、`saml-reauth-required`、`untrusted-certificate`、`upstream-already-exists`、`workflow-push-rejected`、`generate-commit-message`、`worktrees`、`reset`、`secret-scanning`、`remove-repository`、`rename-branch`。

## 8. 如何扩动态规则(`src/rules.ts`)

- 每条 `{pattern, flags, replacement}`,pattern 用 `^…$` 锚定,replacement 用 `$1/$2`。
- **顺序重要**：catch-all 兜底规则（如 `^Last fetched (.+)$`）必须排在具体规则之后。`^Pull requests in (.+)$` 必须排在 `^Pull (.+)$` 之前。
- 含变量插值的句子用规则，不用字典。
- **菜单动态标签也走规则**：`buildMenuPatch(dict, rules)` 会把规则嵌入 `main.js`；右键菜单的多选/忽略/挑拣/压缩/重排标签依赖它。
- 加规则后跑 `npm test`，并在 `test/rules.test.cjs` 加正例/反例。

## 9. 发布流程(Release)

1. 同步 `package.json`、`package-lock.json`、`rust/Cargo.toml` 版本。
2. `npm run build:rune-assets` 刷新资产。
3. `npm test && npm run test:rune`。
4. `npm run package` 生成 `build/github-desktop-zh-<version>-portable.exe`。
5. commit → push。
6. `git tag -a vx.y.z -m "vx.y.z" && git push origin vx.y.z`。
7. beta 用 `gh release create ... --prerelease`；正式版用 `--latest`。
8. 验证:`gh release view vx.y.z --json isDraft,isPrerelease,assets`。

## 10. 路线图(按风险分级)

### 已完成
- Electron → Rune 原生桌面迁移（Rust 1.99.1，体积 78 MB → 16 MB，启动 5.9 s → 0.3 s）
- Rune GUI：Card/Button/Select/Badge/Spinner/IconButton，自绘标题栏，深色/浅色
- Rust 补丁器 1:1 移植（备份、事务回滚、所有权、异常状态、进程拦截）
- 同 EXE CLI：`--patch/--restore/--status/--version/--target`
- 翻译资产生成 + `--check` 一致性测试
- rcedit 图标/版本 + signtool 自签名
- 字典 1476 条、规则 82 条、Node 23 项、Rust 12 项测试

### 安全可做(纯数据/增量)
- 字典 batch 7（见第 7 节候选）
- 补 rules 新正例 + 对应测试

### 有风险(需 Windows 实测)
- **升级 Rune rev**：`Cargo.toml` 固定 rev，升级时同步 `rust/vendor/` 四个 patch，重跑视觉/高 DPI/无障碍回归。
- **MSVC 官方构建**：本机 GNU 构建已可用；GitHub Actions 建议用 MSVC + `ilammy/msvc-dev-cmd`，以获得完整 EXE 资源与更小依赖。
- **高对比度模式**：Rune 未提供 `forced-colors` 等价 API，需要读取 Windows 高对比度设置并切换主题。
- **Rune pre-release**：API 可能破坏；升级前锁 rev、看 changelog、跑 `npm run test:all`。
- **右键菜单 `new MenuItem()`**：仍只劫持 `Menu.buildFromTemplate`；`role`-based 项无 `label`，不要碰。
- **Squirrel 升级**：新 `app-x.y.z` 目录会重新变成英文，需重新汉化。
- **跨平台**：当前只支持 Windows x64；Rune 本身支持多平台，但安装定位/进程检测尚未抽象。

### 已知小瑕疵
- Rune EXE 约 16 MB，仍大于理想值；可继续调 `opt-level`/strip/LTO。
- 翻译运行时仍是注入 JS，无法被 Rust 替代。
- 高 DPI 下窗口/截图工具需 DPI-aware，否则容易误判“窗口只有 6×6”。

## 11. 环境与认证

- 开发机：Windows 11，已装 GitHub Desktop 3.6.3/3.6.4。
- Rust：`rustup` 1.99.1；本机使用 GNU 工具链 + MSYS2 UCRT64 binutils。
- Node 24 / npm 11；`gh auth` 已登录 `PhonetoFR`，Git 协议 HTTPS。
- 每次改 IPC 等价逻辑（补丁写文件/回滚）后，必须跑 Rust 测试 + 真实 3.6.4 汉化/还原闭环。

## 12. 提交约定

- Conventional commits：`feat:` / `fix:` / `chore:` / `docs:` / `test:`。
- 字典扩充提交信息带条目数变化，如 `feat: expand dictionary batch 6 (...1373→1476)`。
- 不主动 commit/push 除非用户明确要求（本会话用户已授权「每次改完 commit 并 push」）。

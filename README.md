<p align="center">
  <img src="https://raw.githubusercontent.com/PhonetoFR/githubdesktop-zh/master/rust/assets/icon.png" width="96" alt="logo" />
</p>

<h1 align="center">GitHub Desktop 汉化补丁</h1>

<p align="center">
  <a href="https://github.com/PhonetoFR/githubdesktop-zh/releases/latest"><img src="https://img.shields.io/github/v/release/PhonetoFR/githubdesktop-zh?style=flat-square&color=0969da" alt="release" /></a>
  <a href="https://github.com/PhonetoFR/githubdesktop-zh/blob/master/LICENSE"><img src="https://img.shields.io/github/license/PhonetoFR/githubdesktop-zh?style=flat-square" alt="license" /></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-Windows%20x64-blue?style=flat-square" alt="platform" /></a>
  <a href="https://github.com/PhonetoFR/githubdesktop-zh/releases"><img src="https://img.shields.io/github/downloads/PhonetoFR/githubdesktop-zh/total?style=flat-square&color=0969da" alt="downloads" /></a>
</p>

<p align="center">一键将 GitHub Desktop 汉化为简体中文，支持随时还原 · Rune 原生界面 · 离线运行</p>

---

## 使用方法

1. 从 [Releases](https://github.com/PhonetoFR/githubdesktop-zh/releases/latest) 下载 `github-desktop-zh-*-portable.exe`
2. 关闭 GitHub Desktop
3. 双击运行，选择目标版本 → **应用汉化**
4. 重新打开 GitHub Desktop

> 还原：同样操作，点击 **还原英文** 即可恢复。

## 特性

<table>
<tr><td><strong>Rune 原生界面</strong></td><td>Rust + GPU 渲染，无 Electron / 无 WebView；单文件约 16 MB，冷启动约 0.3 秒</td></tr>
<tr><td><strong>一键汉化 / 还原</strong></td><td>自动检测安装版本、运行状态和备份状态，只修改所选版本</td></tr>
<tr><td><strong>安全回滚</strong></td><td>自动备份原文件，写入失败时回滚，不覆盖非本工具文件</td></tr>
<tr><td><strong>免安装便携</strong></td><td>单个 EXE，不写系统安装项，不依赖 Node / Electron 运行时</td></tr>
<tr><td><strong>深色 / 浅色</strong></td><td>跟随系统自动切换，自绘标题栏与原生 caption 按钮</td></tr>
<tr><td><strong>键盘与无障碍</strong></td><td>Tab 焦点、Enter/Space 激活、AccessKit UI Automation、减少动画</td></tr>
<tr><td><strong>离线运行</strong></td><td>不联网、不收集数据、不需要账号</td></tr>
</table>

## 原理

在 GitHub Desktop 的 `index.html` 中加载翻译运行时，并在 `main.js` 顶部注入菜单补丁。运行时使用 MutationObserver 监听 DOM 变化，将英文文本替换为中文。

Rune 只负责桌面壳和补丁器；翻译字典、动态规则、`runtime.js` 与菜单补丁仍然生成 JavaScript 后注入 GitHub Desktop。

不修改核心业务逻辑 · 不影响自动更新 · 不收集用户数据

## 命令行用法

同一个 EXE 同时是 GUI 和 CLI：

```bash
github-desktop-zh.exe --patch              # 汉化最新安装
github-desktop-zh.exe --restore            # 还原最新安装
github-desktop-zh.exe --status             # 查看所有安装状态
github-desktop-zh.exe --patch --target=3.6.4
github-desktop-zh.exe --version
```

## 构建

环境要求：

- Node.js 20+（仅用于生成翻译资产和运行字典/规则测试）
- Rust 1.99.1（`rust-toolchain.toml` 已固定）
- Windows x64
  - 推荐：Visual Studio Build Tools + C++ 桌面开发（MSVC）
  - 或 GNU 工具链：`x86_64-pc-windows-gnu` + MSYS2 UCRT64 `binutils`

```bash
npm install
npm run dev           # 生成翻译资产并启动 Rust GUI
npm run build:rune    # 生成 release EXE → rust/target/release/
npm run package       # 写入图标/版本、签名并复制到 build/
npm test              # 字典 + 规则 + Rune 资产一致性
npm run test:rune     # Rust 补丁器测试
```

产物：`build/github-desktop-zh-<version>-portable.exe`

## 架构

| 层 | 技术 | 位置 |
|---|---|---|
| 桌面 GUI | Rust + Rune + rune-kit | `rust/src/ui.rs` |
| 补丁/还原 | Rust | `rust/src/patcher.rs`、`application.rs`、`install.rs` |
| 翻译字典 | JSON | `dict/zh-CN.json` |
| 动态规则 | TypeScript → 生成资产 | `src/rules.ts` |
| 运行时模板 | TypeScript → 生成资产 | `src/runtime.ts` |
| 菜单补丁模板 | TypeScript → 生成资产 | `src/menu-patch.ts` |
| 生成资产 | Node 脚本 | `rust/assets/`、`scripts/build-rune-assets.cjs` |
| Rune 依赖 | 固定 git rev + 官方 patch | `rust/Cargo.toml`、`rust/vendor/` |

Rune 固定在 `dev` 的 `4970cffe6a4e90c7d613796be8ce39eb3dcb281b`。  
`rust/vendor/` 保存 Rune 官方要求的 `wgpu-hal`、`winit`、`parley_engine`、`accesskit_windows` patch 副本。

## 贡献

翻译表位于 `dict/zh-CN.json`（1476 条），动态规则在 `src/rules.ts`（82 条）。

修改字典或规则后运行 `npm run build:rune-assets` 重新生成 Rust 资产，再运行 `npm test`。

翻译术语遵循 GitHub 中文文档惯例：Repository → 仓库、Branch → 分支、Commit → 提交、Pull Request → 拉取请求 等。

## 局限

- GitHub Desktop 的 Squirrel 更新会创建新 `app-x.y.z` 目录，需重新汉化
- 菜单 `access key`（`&amp;File`）翻译后丢失
- 含变量插值的句子通过正则翻译，未覆盖的欢迎 PR
- 右键菜单（`new MenuItem()`）首版未覆盖
- Rune 仍为 pre-release，升级 Rune rev 需要重新做 Windows 视觉回归

## 许可证

[MIT](https://github.com/PhonetoFR/githubdesktop-zh/blob/master/LICENSE)

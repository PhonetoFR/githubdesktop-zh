<p align="center">
  <img src="https://raw.githubusercontent.com/PhonetoFR/githubdesktop-zh/master/gui/icon.png" width="96" alt="logo" />
</p>

<h1 align="center">GitHub Desktop 汉化补丁</h1>

<p align="center">
  <a href="https://github.com/PhonetoFR/githubdesktop-zh/releases/latest"><img src="https://img.shields.io/github/v/release/PhonetoFR/githubdesktop-zh?style=flat-square&color=0969da" alt="release" /></a>
  <a href="https://github.com/PhonetoFR/githubdesktop-zh/blob/master/LICENSE"><img src="https://img.shields.io/github/license/PhonetoFR/githubdesktop-zh?style=flat-square" alt="license" /></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-Windows%20x64-blue?style=flat-square" alt="platform" /></a>
  <a href="https://github.com/PhonetoFR/githubdesktop-zh/releases"><img src="https://img.shields.io/github/downloads/PhonetoFR/githubdesktop-zh/total?style=flat-square&color=0969da" alt="downloads" /></a>
</p>

<p align="center">一键将 GitHub Desktop 汉化为简体中文，支持随时还原 · 免安装便携 · 离线运行</p>

---

## 使用方法

1. 从 [Releases](https://github.com/PhonetoFR/githubdesktop-zh/releases/latest) 下载 `github-desktop-zh-*-portable.exe`
2. 关闭 GitHub Desktop
3. 双击运行，选择目标版本 → **应用汉化**
4. 重新打开 GitHub Desktop

> 还原：同样操作，点击 **还原英文** 即可恢复。

## 特性

<table>
<tr><td><strong>现代桌面界面</strong></td><td>双击即用，自动检测安装版本、运行状态和备份状态</td></tr>
<tr><td><strong>一键汉化 / 还原</strong></td><td>无需手动选择文件，操作只修改所选版本</td></tr>
<tr><td><strong>安全回滚</strong></td><td>自动备份原文件，写入失败时回滚，不覆盖非本工具文件</td></tr>
<tr><td><strong>免安装便携</strong></td><td>单个 portable EXE，不写入系统安装项，关闭即清理</td></tr>
<tr><td><strong>深色模式</strong></td><td>跟随系统自动切换，标题栏与主体颜色一致</td></tr>
<tr><td><strong>离线运行</strong></td><td>不联网、不收集数据、不需要账号</td></tr>
</table>

## 原理

在 GitHub Desktop 的 `index.html` 中加载翻译运行时，并在 `main.js` 顶部注入菜单补丁。运行时使用 MutationObserver 监听 DOM 变化，将英文文本替换为中文。

不修改核心业务逻辑 · 不影响自动更新 · 不收集用户数据

## 命令行用法

> GUI 是默认发行形式。如需脚本化，可构建 CLI 版本：

```bash
patch-cli.exe --patch              # 汉化最新安装
patch-cli.exe --restore            # 还原最新安装
patch-cli.exe --status             # 查看所有安装状态
patch-cli.exe --patch --target=3.6.2
```

## 构建

```bash
npm install
npm run dev           # 启动桌面 GUI
npm run package       # 打包为 portable EXE → build/
```

GUI 使用 Electron + electron-builder `portable` 目标，产物为单文件免安装 EXE。

## 贡献

翻译表位于 `dict/zh-CN.json`（1476 条），动态规则在 `src/rules.ts`（82 条）。

| 组件 | 文件 |
|------|------|
| 界面文本 | `dict/zh-CN.json` |
| 动态文本规则 | `src/rules.ts` |
| 运行时模板 | `src/runtime.ts` |
| 菜单补丁模板 | `src/menu-patch.ts` |

翻译术语遵循 GitHub 中文文档惯例：Repository → 仓库、Branch → 分支、Commit → 提交、Pull Request → 拉取请求 等。

## 局限

- GitHub Desktop 的 Squirrel 更新会创建新 `app-x.y.z` 目录，需重新汉化
- 菜单 `access key`（`&amp;File`）翻译后丢失
- 含变量插值的句子通过正则翻译，未覆盖的欢迎 PR
- 右键菜单（`new MenuItem()`）首版未覆盖

## 许可证

[MIT](https://github.com/PhonetoFR/githubdesktop-zh/blob/master/LICENSE)
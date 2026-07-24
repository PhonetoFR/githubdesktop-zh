# GitHub Desktop 汉化补丁

Windows 图形化汉化工具，一键将 GitHub Desktop 汉化为简体中文，并可随时还原英文原版。

## 特性

- **现代桌面界面** - 双击即用，清晰显示安装版本、运行状态与备份状态
- **一键汉化** - 自动检测安装路径，无需手动选择文件
- **永久生效** - 直接修改程序文件，每次启动自动汉化
- **一键还原** - 随时恢复为英文原版
- **安全回滚** - 自动备份原文件，写入失败时回滚，不覆盖非本工具文件
- **免安装便携** - 单个 portable EXE，不安装服务，不写入系统安装项
- **开源免费** - MIT 协议，社区共同维护翻译表

## 使用方法

### Windows

1. 从 [Releases](../../releases) 页面下载最新版 `github-desktop-zh-*-portable.exe`
2. 确保 GitHub Desktop 已关闭
3. 双击运行便携程序，无需安装
4. 选择目标版本并点击「应用汉化」
5. 重新打开 GitHub Desktop 即可

### 还原英文版

1. 关闭 GitHub Desktop
2. 重新运行便携程序
3. 选择已汉化版本并点击「还原英文」

## 原理

本工具在 GitHub Desktop 的 `index.html` 中加载独立翻译运行时，并在 `main.js` 中注入菜单翻译补丁。翻译运行时使用 MutationObserver 监听 DOM 变化，将匹配的英文文本替换为中文。

- 不修改 GitHub Desktop 核心业务逻辑
- 不修改任何网络请求
- 不影响自动更新功能
- 不收集任何用户数据

## 贡献翻译

翻译表位于 `dict/zh-CN.json`，欢迎提交 PR 完善翻译：

```json
{
  "File": "文件",
  "Edit": "编辑",
  "Repository": "仓库",
  "Branch": "分支"
}
```

### 翻译规范

- 键：GitHub Desktop 界面中实际显示的英文文本（大小写敏感）
- 值：对应的中文翻译
- 专有名词遵循 GitHub 中文文档惯例：
  - Repository → 仓库
  - Branch → 分支
  - Commit → 提交
  - Pull Request → 拉取请求
  - Fork → 复刻
  - Stash → 暂存
  - Rebase → 变基

## 构建

```bash
npm install
npm run build
npm run dev           # 启动桌面 GUI
npm run package       # 打包为单文件 portable EXE
npm run package:cli   # 可选：构建命令行版本
```

GUI 使用 Electron 与 electron-builder 的 `portable` 目标，产物位于 `build/github-desktop-zh-*-portable.exe`。它是单文件便携程序，不是 MSI/NSIS 安装器；启动时会临时解包运行文件，关闭后自动清理。

命令行版本仍使用 `pkg`。如构建 CLI 时遇到 `ERR_ASSERTION: (!this.bar)`，可使用 `CI=true npm run package:cli` 关闭 pkg 下载进度条。

## 命令行用法

GUI 是默认发行形式。需要自动化时，可单独构建 `patch-cli.exe`：

```bash
patch-cli.exe                     # 进入终端交互菜单
patch-cli.exe --patch             # 汉化最新安装版本
patch-cli.exe --restore           # 还原最新安装版本
patch-cli.exe --status            # 查看所有安装状态
patch-cli.exe --help              # 显示帮助
patch-cli.exe --patch --target=3.6.2
patch-cli.exe --restore --target=3.6.2
```

## 局限说明

本工具以"非侵入式翻译运行时"方式实现汉化，存在以下固有局限：

- **自动更新会失效**：GitHub Desktop 的 Squirrel 更新会创建新的 `app-x.y.z` 目录，汉化对新版本无效。更新后请重新运行便携程序。
- **菜单 access key 失效**：原生菜单的 `&` 加速键（如 `&File`）翻译后丢失，中文菜单通常不需要此键。
- **动态变量文本**：含变量插值的句子（如 `Pushed {n} commits`）通过正则规则翻译。`dict/` 下的规则可能未覆盖所有新动态文本，欢迎补 PR。
- **部分上下文菜单未覆盖**：本工具劫持的是 `Menu.buildFromTemplate`，部分用 `new MenuItem()` 构造的上下文菜单（如右键菜单）首版未覆盖。
- **首次启动菜单需重建**：应用首次启动时若菜单在劫持前已构建，需触发一次菜单重建（如切换仓库）才会显示中文。
- **修改主进程文件**：本工具会修改 `main.js`，已自动备份 `.bak`，异常时可还原或重装 GitHub Desktop。

## 贡献翻译

- 界面文本：编辑 `dict/zh-CN.json`（精确匹配字典）
- 动态文本规则：编辑 `src/rules.ts`（正则匹配）
- 渲染运行时模板：编辑 `src/runtime.ts`
- 菜单劫持模板：编辑 `src/menu-patch.ts`

提交 PR 前请用 `npm run build` 验证编译通过，并附上 GitHub Desktop 截图说明覆盖/新增文本。

## 许可证

MIT License

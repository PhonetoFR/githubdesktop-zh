# GitHub Desktop 汉化补丁

一键将 GitHub Desktop 永久汉化为简体中文，支持随时还原为英文原版。

## 特性

- **一键汉化** - 自动检测安装路径，无需手动操作
- **永久生效** - 直接修改程序文件，每次启动自动汉化
- **一键还原** - 随时恢复为英文原版
- **轻量安全** - 不修改程序核心逻辑，只注入翻译层
- **开源免费** - MIT 协议，社区共同维护翻译表

## 使用方法

### Windows / macOS / Linux

1. 从 [Releases](../../releases) 页面下载最新版 `patch.exe`
2. 确保 GitHub Desktop 已关闭
3. 双击运行 `patch.exe`
4. 选择「一键汉化」
5. 重新打开 GitHub Desktop 即可

### 还原英文版

1. 关闭 GitHub Desktop
2. 重新运行 `patch.exe`
3. 选择「还原原版」

## 原理

本工具通过修改 GitHub Desktop 的 `renderer.js` 文件，在页面加载时注入一层翻译运行时。翻译运行时使用 MutationObserver 监听 DOM 变化，将匹配的英文文本替换为中文。

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
npm run package   # 打包为单文件 .exe
```

## 许可证

MIT License

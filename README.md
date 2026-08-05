# QuickShell

一个轻量、可交互的 Windows CMD / PowerShell / Git Bash 桌面终端工具。

主窗口只展示命令名称；命令管理和每次执行都会在独立子窗口中完成。应用不启用置顶功能。

## 开发

```powershell
npm install
npm run tauri dev
```

## 构建

```powershell
npm run build
npm run tauri build
```

核心交互由 Rust PTY 与 Windows ConPTY 提供，React 仅负责终端渲染、命令管理和配置界面。

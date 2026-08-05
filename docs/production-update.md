# 生产环境在线更新

QuickShell 使用 Tauri Updater 更新已安装的 Windows 客户端。更新包由 GitHub Actions 构建并签名，发布到 GitHub Release；客户端从 GitHub Release 的 `latest.json` 检查更新。

## 发布流程

1. 同步修改 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 中的版本号。
2. 提交并推送代码。
3. 创建匹配版本号的标签，例如 `v0.1.1`。
4. 推送标签：`git push origin v0.1.1`。
5. GitHub Actions 自动构建、签名、生成 `latest.json` 并发布 Release。

客户端检查地址为：

```text
https://github.com/undotot/quickshell/releases/latest/download/latest.json
```

## GitHub Secrets

在仓库的 Settings → Secrets and variables → Actions 中配置：

- `TAURI_SIGNING_PRIVATE_KEY`：Tauri 私钥文件的完整内容。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：如果私钥设置了密码则填写，否则留空。

私钥不能提交到 Git，也不能写入 `tauri.conf.json`。当前开发机生成的私钥位于用户目录下的 `.tauri` 文件夹中，应安全保存并复制到 GitHub Secret。

## 更新行为

- 应用启动后约 5 秒自动检查更新。
- 24 小时内不会重复自动检查。
- 底部状态栏支持手动检查更新。
- 发现更新后显示版本号、更新说明和下载进度。
- 安装完成后自动重启应用。
- 更新不会覆盖应用数据目录中的命令和设置文件。

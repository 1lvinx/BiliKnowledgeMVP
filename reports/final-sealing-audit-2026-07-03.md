# 哔知 Final Sealing Audit - 2026-07-03

## 结论

当前版本可以进入 **Beta RC 封板候选**，但如果面向公开下载，仍需明确标注：未签名、未公证，仅适合内测/受信用户安装。

## 本次验证

| 项目 | 结果 | 备注 |
|---|---:|---|
| 前端生产构建 | PASS | `npm run build` 成功 |
| npm 安全审计 | PASS | 0 vulnerabilities |
| Tauri/Rust 测试 | PASS | 24 passed |
| Python 知识库测试 | PASS | 16 passed |
| 知识库结构/链接/敏感扫描 | PASS | validate_knowledge_base 0 issues |
| Python 脚本编译 | PASS | compileall 成功 |
| Doctor 环境诊断 | PASS | B站登录态、ffmpeg、yt-dlp、FunASR、模型缓存均可用 |
| Chrome Companion 基础校验 | PASS | MV3 manifest 可解析，JS 语法通过 |
| Tauri release app | PASS | `哔知.app` 构建成功 |
| DMG 打包 | PASS | 清理旧 bundle 后成功生成 |

## 生成产物

- App：`BiliKnowledgeApp/src-tauri/target/release/bundle/macos/哔知.app`
- DMG：`BiliKnowledgeApp/src-tauri/target/release/bundle/dmg/哔知_0.1.0_x64.dmg`

## 已发现并处理

- 第一次 DMG 打包失败，原因是 release bundle 目录残留旧 `rw.*.dmg` 和旧 app 产物；清理 `BiliKnowledgeApp/src-tauri/target/release/bundle` 后重新打包成功。
- `BiliKnowledge/manifest/token_usage.json` 是运行时计量文件，已加入 `.gitignore`，避免误提交。

## 封板前注意

1. `BiliKnowledge/config/config.json` 是本机忽略文件，含本地 Cookie/API Key，不会进入 Git；发布截图和打包时仍需注意不要泄露。
2. 当前 app 未 Developer ID 签名、未 Notarization。公开分发前需要补签名和公证。
3. B站 Cookie/字幕获取属于平台依赖能力，应在 README/帮助页明确低频使用和个人学习用途。
4. 建议每天处理 5-10 条视频，不建议批量高并发。

# 哔知 / BiZhi

> 把真正值得留下的 B 站视频，整理成可复用的知识资产。

哔知是一个本地优先的 B 站视频 AI 知识库工具。它帮助你从精选视频中获取字幕、生成洞察、沉淀 Markdown 笔记，并识别视频里提到的 GitHub 开源项目。

哔知不是“全自动总结所有视频”的爬虫工具。它更像一个半自动视频知识工作台：用户负责选择值得沉淀的视频，AI 负责字幕整理、洞察提取、笔记结构化和项目线索识别，最终由用户判断、标注、取舍和复用。

## Why

很多人会在 B 站收藏大量 AI、编程、产品、设计、开源项目相关视频，但真正需要复用时，很难从收藏夹里再次找到关键知识。收藏夹保存的是视频入口，不是知识本身。

哔知希望解决的问题是：

- 收藏的视频难以再次检索；
- 视频中的工具、仓库、方法论容易看过就忘；
- AI 总结如果缺少字幕和证据，容易变成空泛废话；
- 手动整理字幕、笔记、标签和项目线索太耗时；
- 用户需要一个长期可维护、可导出、可验证的本地知识库。

## Features

- **B 站视频导入**：支持收藏夹同步和手动添加 BV / av / B 站链接 / b23.tv 短链。
- **字幕优先**：优先抓取 B 站原生/AI 字幕；缺失时可使用本地 ASR 转写。
- **视频洞察**：基于字幕生成摘要、关键观点、适用场景、风险和判断依据。
- **精炼笔记**：生成本地 Markdown 笔记，面向复用而不是堆长文。
- **开源候选**：从笔记和字幕中识别 GitHub 仓库，沉淀为高价值项目候选。
- **想法注入**：允许用户记录真实判断、下一步动作和标签。
- **Token 计量**：记录每条视频洞察/笔记生成的模型用量，帮助用户理解潜在成本。
- **Doctor 诊断**：检查 Python、ffmpeg、yt-dlp、ASR 依赖、模型缓存、B 站登录态和 AI 配置。
- **Chrome Companion**：浏览器助手用于获取当前视频、Cookie 和页面元数据，并发送到桌面端。
- **本地优先**：知识库以本地文件形式保存，便于备份、审计和迁移。

## Screenshots

Screenshots will be added before the public release.

## How It Works

```text
B 站视频
  ↓
抓取字幕 / 本地转写
  ↓
生成视频洞察
  ↓
生成 Markdown 笔记
  ↓
识别 GitHub 项目候选
  ↓
沉淀到本地知识库 / 想法 / 开源候选
```

## Recommended Usage

哔知适合少量精选、高价值、低并发的日常知识整理。

推荐：

- 每天精选 5–10 条真正值得沉淀的视频；
- 优先处理 15 秒到 30 分钟的视频；
- 一次处理一条视频，确认字幕质量后再生成洞察和笔记；
- 使用 Doctor 检查本地环境；
- 使用 Token 计量理解模型调用成本。

不推荐：

- 一次性批量处理整个收藏夹；
- 高并发抓取字幕或视频信息；
- 将哔知作为爬虫工具使用；
- 未经许可公开分发字幕、笔记或视频内容；
- 用 AI 生成内容替代原作者的视频内容。

## Install

Beta RC currently focuses on macOS local testing. Public multi-platform release packages will be generated through GitHub Actions after the release workflow is stabilized.

For local development, see [Development](#development).

## Quick Start

```bash
git clone https://github.com/<your-account>/<your-repo>.git
cd bili-knowledge-mvp
cd BiliKnowledgeApp
npm install
npm run tauri dev
```

The desktop app uses real local data through Tauri. Browser preview mode is only for UI preview and may show sample data.

## Local Requirements

Required:

- Node.js 22+
- Rust toolchain
- Python 3.9+

Recommended for full workflow:

- ffmpeg
- yt-dlp
- Python virtual environment
- FunASR / ModelScope / PyTorch stack for local ASR
- A configured AI provider or local OpenAI-compatible endpoint

Optional environment variables:

```bash
export BILIKNOWLEDGE_ROOT=/absolute/path/to/BiliKnowledge
export BILIKNOWLEDGE_PYTHON=/absolute/path/to/python3
```

## Knowledge Base Layout

```text
BiliKnowledge/
├── config/config.json              # local-only config; ignored by Git
├── manifest/videos.json            # imported/manual video manifest
├── manifest/insights.json          # generated insights
├── manifest/token_usage.json       # local token usage ledger
├── subtitles/                      # fetched or transcribed subtitles
├── notes/raw/                      # generated Markdown notes
├── projects/project_candidates.json
├── thoughts/user_ideas.json
└── reports/
```

Generated local data, cookies, API keys, subtitles, personal notes, and manifests should not be committed.

## Privacy and Security

哔知 stores sensitive runtime data locally, including B 站 Cookie fields and AI provider API keys. When you use an external AI provider, selected subtitle or note text may be sent to that provider for processing.

Before sharing logs, screenshots, or repositories, check for:

- B 站 Cookie / `SESSDATA` / `bili_jct` / `DedeUserID`;
- AI provider API keys;
- private notes and subtitles;
- model service request logs;
- local file paths you do not want to expose.

See [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md).

## Token Metering and Cost Notice

哔知 records per-video AI usage for insight generation, note generation, and AI-assisted GitHub project matching.

- If the provider returns `usage`, 哔知 records the provider value.
- If the provider does not return `usage`, 哔知 records a local estimate.
- Token metering is a cost transparency feature, not a billing system.
- Actual cost is determined by the model provider configured by the user.

## Chrome Companion

`BiliKnowledgeCompanion/` contains a Chrome MV3 extension prototype. Its role is intentionally narrow:

- detect current Bilibili video page;
- read required Bilibili Cookie fields with user permission;
- send current video metadata and login state to the local desktop app;
- avoid moving AI processing into the browser.

All AI processing remains inside the desktop app.

## Development

Install dependencies:

```bash
cd BiliKnowledgeApp
npm install
```

Run the app:

```bash
npm run tauri dev
```

Run frontend build:

```bash
npm run build
```

Run Rust tests:

```bash
cd BiliKnowledgeApp/src-tauri
cargo test
```

Run Python checks:

```bash
python3 BiliKnowledge/scripts/test_validate_knowledge_base.py
python3 BiliKnowledge/scripts/test_update_processing_status.py
python3 BiliKnowledge/scripts/validate_knowledge_base.py --root BiliKnowledge
python3 -m compileall -q BiliKnowledge/scripts
```

Run Doctor:

```bash
python3 BiliKnowledge/scripts/doctor.py --root BiliKnowledge
```

## Release

Release packages are built by GitHub Actions from tags. The intended release flow is:

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin main --tags
```

The release workflow builds desktop packages for macOS, Windows, and Linux using Tauri.

See [docs/RELEASE.md](docs/RELEASE.md).

## Roadmap

- Stabilize Doctor repair flow;
- Improve first-run onboarding;
- Harden Cookie refresh and browser bridge;
- Improve subtitle quality checks;
- Improve GitHub project matching confidence;
- Add signed and notarized macOS release;
- Add clearer Open Source RC checklist;
- Prepare public beta documentation.

## Contributing

Contributions are welcome, but please keep the product boundary clear:哔知 is a local-first, user-selected, low-concurrency knowledge workflow tool.

Before opening a PR, read [CONTRIBUTING.md](CONTRIBUTING.md) and run the verification commands above.

## License

MIT License. See [LICENSE](LICENSE).

## Disclaimer

This project is for personal knowledge management and learning workflows. It is not affiliated with Bilibili. Users are responsible for complying with Bilibili rules, copyright requirements, AI provider terms, and local laws. Do not use this project to bypass platform restrictions or redistribute content without permission.

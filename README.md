# 哔知 / BiliKnowledge MVP

Local-first desktop workspace for turning selected Bilibili videos into subtitles, insights, concise Markdown notes, open-source project candidates, and a personal knowledge base.

哔知不是“全自动总结所有视频”的工具，而是一个**半自动视频知识工作台**：

- 用户负责选择真正值得沉淀的视频；
- AI 负责字幕整理、洞察提取、笔记结构化和项目线索识别；
- 用户最终负责判断、标签、取舍和复用。

Recommended positioning:

> 帮你把真正值得留下的 B站视频，整理成可复用的知识资产。

## What Works Now

- Tauri desktop app with React frontend and Rust command bridge
- Local knowledge base stored in `BiliKnowledge/`
- QR login flow for collecting Bilibili cookies in the desktop runtime
- Favorite sync plus manual video add from BV / av / full Bilibili URL / b23.tv short link
- Single-video workflow: fetch subtitles or local ASR, generate insight, generate concise note
- GitHub project candidate extraction from generated notes and insights
- Doctor diagnostics for Python, ffmpeg, yt-dlp, ASR dependencies, model cache, Bilibili login state, AI config, and workspace health
- Script execution for manifest generation, project extraction, index build, and validation
- CI checks for frontend build, Rust tests, and Python script tests

## Recommended Usage Boundary

哔知 is designed for **small, selected, high-value daily processing**, not mass scraping.

Recommended:

- Pick 5–10 videos per day that are truly worth keeping.
- Prefer short to medium videos. The current validation focus is roughly short clips to ~30 minute videos.
- Process one selected video at a time.
- Use manual subtitle import or local transcription as fallback when Bilibili subtitles are unavailable.

Not recommended:

- Bulk processing thousands of favorites.
- High-concurrency scraping.
- Using the app as a crawler.
- Publicly redistributing subtitles, generated notes, or source video content without permission.

## Repository Layout

```text
.
├── BiliKnowledge/         # Local data, notes, manifests, scripts, reports
├── BiliKnowledgeApp/      # Tauri desktop app
├── docs/                  # Extra docs
├── .github/workflows/     # CI
├── CONTRIBUTING.md
├── SECURITY.md
└── README.md
```

## Local Requirements

- Node.js 22+
- Rust toolchain
- python3

Optional:

- `BILIKNOWLEDGE_ROOT` to point at a custom knowledge-base directory
- `BILIKNOWLEDGE_PYTHON` to point at a custom Python interpreter

## Quick Start

```bash
cd BiliKnowledgeApp
npm install
npm run tauri dev
```

Desktop app behavior:

- In Tauri desktop mode, the app reads and writes real local data.
- In browser preview mode, the app shows sample data only and does not execute local scripts.

## Verification

```bash
cd BiliKnowledgeApp && npm run build
cd BiliKnowledgeApp/src-tauri && cargo test
cd /path/to/bili-knowledge-mvp
python3 BiliKnowledge/scripts/test_validate_knowledge_base.py
python3 BiliKnowledge/scripts/test_update_processing_status.py
python3 BiliKnowledge/scripts/validate_knowledge_base.py --root BiliKnowledge
```

## Current Script Entry Points

- `parse_favorites.py`
- `fetch_subtitles.py`
- `transcribe_subtitles.py`
- `generate_insights.py`
- `generate_notes.py`
- `reconcile_notes.py`
- `extract_projects.py`
- `build_index.py`
- `validate_knowledge_base.py`
- `doctor.py`
- `doctor_fix.py`

## Runtime Data and Privacy

Default local workspace:

```text
BiliKnowledge/
├── config/config.json          # local app config, Bilibili cookie fields, AI config
├── manifest/videos.json        # imported/manual video manifest
├── manifest/insights.json      # generated insights
├── subtitles/                  # fetched or locally transcribed subtitles
├── notes/raw/                  # generated Markdown notes
├── projects/project_candidates.json
├── thoughts/user_ideas.json
└── reports/
```

Privacy notes:

- Bilibili Cookie / SESSDATA is stored locally in `BiliKnowledge/config/config.json`.
- AI provider API keys are stored locally in the same config file.
- Subtitles, insights, notes, project candidates, and user ideas are local files.
- When using an external AI provider, selected subtitle/text content may be sent to that provider for insight/note generation.
- Do not commit real cookies, API keys, personal notes, or private manifests.

## Legal and Platform Notes

This project is intended for personal learning, research, and local knowledge management.

- Users must comply with Bilibili platform rules and applicable copyright law.
- The app does not provide any bypass for platform restrictions.
- Avoid bulk fetching or high-frequency requests that may trigger platform risk controls.
- Do not use this project to redistribute copyrighted video content, subtitles, or derivative notes without permission.

## Doctor

Run diagnostics:

```bash
python3 BiliKnowledge/scripts/doctor.py --root BiliKnowledge
```

Attempt local repair:

```bash
python3 BiliKnowledge/scripts/doctor.py --root BiliKnowledge --fix
```

Doctor checks:

- Python virtual environment
- ffmpeg
- yt-dlp runtime
- ASR Python modules
- model cache hints
- Bilibili login state
- AI provider/base URL/model/API key
- knowledge-base directory structure

## Security Notes

- Do not commit real Bilibili cookies or AI provider API keys.
- The validation script scans notes, projects, thoughts, and manifests for common secret patterns.

## License

MIT. See [LICENSE](LICENSE).

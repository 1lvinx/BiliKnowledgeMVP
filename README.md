# BiliKnowledge MVP

Local-first desktop workspace for importing Bilibili favorites, organizing Markdown notes, extracting project candidates, and validating the knowledge base.

## What Works Now

- Tauri desktop app with React frontend and Rust command bridge
- Local knowledge base stored in `BiliKnowledge/`
- QR login flow for collecting Bilibili cookies in the desktop runtime
- Script execution for manifest generation, project extraction, index build, and validation
- CI checks for frontend build, Rust tests, and Python script tests

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
- `extract_projects.py`
- `build_index.py`
- `validate_knowledge_base.py`

## Security Notes

- Do not commit real Bilibili cookies or AI provider API keys.
- The validation script scans notes, projects, thoughts, and manifests for common secret patterns.

## License

MIT. See [LICENSE](LICENSE).

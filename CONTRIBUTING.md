# Contributing

Thank you for considering a contribution to 哔知 / BiZhi.

## Product Boundary

哔知 is a local-first, user-selected, low-concurrency video knowledge workflow tool. Please avoid contributions that turn it into a mass crawler, background batch processor, or all-automatic summary machine.

## Development Setup

1. Install Node.js 22+, Rust, and Python 3.9+.
2. Install frontend dependencies:

```bash
cd BiliKnowledgeApp
npm install
```

3. Start the desktop app:

```bash
npm run tauri dev
```

Browser preview mode is only for UI preview. Validate real local behavior in the Tauri desktop app.

## Verification

Run these checks before opening a PR:

```bash
cd BiliKnowledgeApp
npm run build
npm audit --audit-level=moderate
cd src-tauri
cargo test
cd ../..
python3 BiliKnowledge/scripts/test_validate_knowledge_base.py
python3 BiliKnowledge/scripts/test_update_processing_status.py
python3 BiliKnowledge/scripts/validate_knowledge_base.py --root BiliKnowledge
python3 -m compileall -q BiliKnowledge/scripts
python3 tools/scan_sensitive.py
```

## Security and Privacy

Do not commit:

- Bilibili Cookie / `SESSDATA` / `bili_jct` / `DedeUserID`;
- AI provider API keys;
- local `.env` files;
- private subtitles, notes, screenshots, or manifests;
- model cache or virtual environments;
- generated release artifacts.

## Pull Requests

A good PR should include:

- a clear problem statement;
- a small focused change;
- screenshots for UI changes;
- validation commands and results;
- notes about privacy, token cost, or platform behavior if relevant.

## Python Interpreter

If your Python interpreter is not on `PATH`, set:

```bash
export BILIKNOWLEDGE_PYTHON=/absolute/path/to/python3
```

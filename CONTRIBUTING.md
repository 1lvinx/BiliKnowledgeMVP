# Contributing

## Development Setup

1. Install `Node.js 22+`, `Rust`, and `python3`.
2. Install frontend dependencies:
   `cd BiliKnowledgeApp && npm install`
3. Start the desktop app:
   `npm run tauri dev`

## Verification

Run these checks before opening a PR:

```bash
cd BiliKnowledgeApp && npm run build
cd BiliKnowledgeApp/src-tauri && cargo test
cd /path/to/bili-knowledge-mvp
python3 BiliKnowledge/scripts/test_validate_knowledge_base.py
python3 BiliKnowledge/scripts/test_update_processing_status.py
python3 BiliKnowledge/scripts/validate_knowledge_base.py --root BiliKnowledge
```

## Notes

- Do not commit real Bilibili cookies, API keys, or local `.env` files.
- Browser preview mode uses sample data. Validate real behavior in the Tauri desktop app.
- If your Python interpreter is not on `PATH`, set `BILIKNOWLEDGE_PYTHON=/absolute/path/to/python3`.

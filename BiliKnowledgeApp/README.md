# 哔知 / BiliKnowledgeApp

Desktop application for the BiliKnowledge workspace, built with Tauri, React, TypeScript, and Rust.

The app is a semi-automatic Bilibili video knowledge workspace. It is not intended to bulk summarize all favorites; users should select valuable videos, then run single-video subtitle, insight, note, and project-candidate workflows.

## Start

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run build
cd src-tauri && cargo test
```

## Runtime Notes

- Tauri desktop mode uses real local data and executes whitelisted scripts.
- Plain browser mode is preview-only and uses sample data.
- QR login is intended to be tested in the desktop app, not in browser preview.
- Favorites can be synced from Bilibili, and individual videos can also be manually added from BV / av / full Bilibili URL / b23.tv short link.
- Local data lives under `../BiliKnowledge` by default.
- Run Doctor from Settings or via `python3 ../BiliKnowledge/scripts/doctor.py --root ../BiliKnowledge` when subtitle fetching, ASR, or note generation fails.

## Environment Overrides

- `BILIKNOWLEDGE_ROOT` sets the knowledge-base directory
- `BILIKNOWLEDGE_PYTHON` sets the Python interpreter for script execution

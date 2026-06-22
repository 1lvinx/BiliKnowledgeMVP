# BiliKnowledgeApp

Desktop application for the BiliKnowledge workspace, built with Tauri, React, TypeScript, and Rust.

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

## Environment Overrides

- `BILIKNOWLEDGE_ROOT` sets the knowledge-base directory
- `BILIKNOWLEDGE_PYTHON` sets the Python interpreter for script execution

# BiliKnowledgeMVP

BiliKnowledgeMVP is a local-first knowledge workspace for managing Bilibili favorites, video notes, open-source project candidates, and knowledge-base health checks.

## Current Version

- Preview tag: `v0.2.0-preview`
- Current branch: `feature/v0.2-ui-refactor-shell`
- Runtime: Tauri desktop app
- Frontend: React + TypeScript + Vite
- Backend bridge: Rust / Tauri commands
- Knowledge base: local Markdown + JSON/CSV manifests

## Core Features

- Import and manage Bilibili favorite videos
- Generate local video manifest files
- Browse video library and note documents
- Extract open-source project candidates from notes
- Validate knowledge-base structure, links, and sensitive data
- Run local automation scripts through the Tauri desktop app

## Project Structure

```txt
BiliKnowledgeMVP/
├── BiliKnowledge/        # Local knowledge base, notes, manifest and project data
├── BiliKnowledgeApp/     # Tauri desktop application
├── docs/                 # Project documentation
├── README.md
└── .gitignore
```

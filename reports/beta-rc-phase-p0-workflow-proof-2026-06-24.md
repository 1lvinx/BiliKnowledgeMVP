# Beta RC Phase P0 Workflow Proof

Date: 2026-06-24  
Release candidate: `v0.1.0-beta-rc.1`  
Baseline branch: `main`

## Scope

This Beta RC packages the Phase P0 Workflow Proof baseline for Bili Knowledge MVP. The scope focuses on workflow stability, configuration safety, notes path correctness, visual preference persistence, sidebar theme switching, and production bundle splitting.

## Included commits

```text
a23ba51 chore: clean generated artifacts and update dependencies
16ce2fe fix: harden config validation and remove workflow side effects
1904186 fix: resolve notes path handling and preference persistence
92bcdf0 feat: add visual preferences and sidebar theme toggle
df6546d perf: split routes and markdown into lazy-loaded chunks
```

## P0 acceptance proof

### Dependency and artifact hygiene

- Removed tracked generated backup artifacts.
- Added backup artifact ignore coverage.
- Updated frontend build dependencies.
- Confirmed dependency audit reports zero known vulnerabilities.

### Workflow safety

- Hardened Tauri config validation for preferences.
- Prevented invalid visual/timezone/font/density preferences from being persisted.
- Removed automatic hidden knowledge refresh side effects when navigating into knowledge/project views.
- Kept refresh as an explicit user-controlled action.

### Notes and preference persistence

- Notes now resolve through `video.note_path` when present, falling back to `${video.id}.md`.
- Language, appearance, timezone, font, and density preference updates persist immediately.
- Display time formatting now respects the selected timezone.

### Visual preferences and UI

- Added visual preferences for appearance, timezone, font, and density.
- Added sidebar light/dark toggle at the lower sidebar area.
- Added CSS variable support for theme, density, and font stacks.
- Improved card/list/notice layout stability to reduce visual stacking and overflow issues.

### Performance

- Split large route/view modules into lazy-loaded chunks.
- Split `react-markdown` into its own lazy chunk.
- Confirmed Vite production build no longer emits the previous large main chunk warning.

## Validation commands

All commands completed successfully before this RC marker:

```bash
cd BiliKnowledgeApp
npm run build
npm audit --json

cd BiliKnowledgeApp/src-tauri
cargo test

cd /Users/elvinx/DevCompany/products/bili-knowledge-mvp
python3 BiliKnowledge/scripts/test_validate_knowledge_base.py
python3 BiliKnowledge/scripts/test_update_processing_status.py
python3 BiliKnowledge/scripts/validate_knowledge_base.py --root BiliKnowledge
python3 -m compileall -q BiliKnowledge/scripts
```

## Validation results

- Frontend production build: PASS
- npm audit: PASS, 0 vulnerabilities
- Tauri/Rust tests: PASS, 20 tests passed
- Knowledge-base validation tests: PASS, 11 tests passed
- Processing-status tests: PASS, 5 tests passed
- Knowledge-base structure/link/sensitive-data validation: PASS, 0 issues
- Python script compile check: PASS

## RC decision

Status: **Beta RC accepted locally**

This commit is suitable as the local Beta Candidate baseline. Remote push, release publishing, notarized packaging, and wider device/manual QA remain separate follow-up steps.

## Local package artifact proof

Generated on: 2026-06-24  
Command:

```bash
cd BiliKnowledgeApp
npm run tauri build
```

Generated artifacts:

```text
BiliKnowledgeApp/src-tauri/target/release/bundle/macos/biliknowledgeapp.app
BiliKnowledgeApp/src-tauri/target/release/bundle/dmg/biliknowledgeapp_0.1.0_x64.dmg
```

DMG checksum:

```text
f04fd7713598a419c2108fd05fc3d75b087b004cdc8610e1ab9bcddfff4ef592  BiliKnowledgeApp/src-tauri/target/release/bundle/dmg/biliknowledgeapp_0.1.0_x64.dmg
```

Package notes:

- Tauri release build: PASS
- macOS `.app` bundle generation: PASS
- macOS `.dmg` bundle generation: PASS
- Code signing: NOT SIGNED in this local build
- Gatekeeper assessment: local machine reports accepted because security assessment is disabled / no usable signature

Release gate:

This local RC artifact is suitable for internal smoke validation. Public distribution still requires Developer ID signing, notarization, and stapling in a release environment with Apple credentials.

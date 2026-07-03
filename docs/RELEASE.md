# Release Guide

This guide describes how 哔知 / BiZhi desktop packages are built and released.

## Release Philosophy

哔知 is a local-first desktop app with platform-sensitive dependencies. A release is not only a build artifact; it must also pass privacy, security, and workflow checks.

## Release Types

### Beta RC

Used for trusted internal testing.

Tag format:

```text
beta-rc-YYYY-MM-DD
```

Example:

```bash
git tag -a beta-rc-2026-07-03 -m "Beta RC 2026-07-03"
git push origin main --tags
```

Beta RC releases are created as GitHub draft prereleases.

### Public Release

Used for public open-source releases.

Tag format:

```text
vMAJOR.MINOR.PATCH
```

Example:

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin main --tags
```

Public releases are also created as draft releases first. The maintainer should manually review assets before publishing.

## GitHub Actions

Release workflow:

```text
.github/workflows/release.yml
```

It builds Tauri bundles for:

- macOS x64;
- macOS arm64;
- Windows x64;
- Linux x64.

The workflow uses `tauri-apps/tauri-action` and uploads generated bundles to a GitHub draft release.

## Signing and Notarization

Unsigned builds are acceptable for internal Beta RC testing only.

Before broad public distribution, configure platform signing:

- macOS Developer ID signing;
- macOS Notarization;
- Windows code signing certificate;
- optional Linux package signing or checksums.

Do not store signing credentials in source files. Use GitHub Actions secrets.

## Pre-release Local Checks

Run from repository root:

```bash
cd BiliKnowledgeApp && npm run build
cd BiliKnowledgeApp && npm audit --audit-level=moderate
cd BiliKnowledgeApp/src-tauri && cargo test
cd ../..
python3 BiliKnowledge/scripts/test_validate_knowledge_base.py
python3 BiliKnowledge/scripts/test_update_processing_status.py
python3 BiliKnowledge/scripts/validate_knowledge_base.py --root BiliKnowledge
python3 -m compileall -q BiliKnowledge/scripts
python3 tools/scan_sensitive.py
```

Optional local desktop package check:

```bash
cd BiliKnowledgeApp
npm run tauri build
```

## Release Asset Review

Before publishing a draft release:

- confirm app name is `哔知`;
- confirm icon is correct;
- confirm generated installers are attached;
- confirm checksums if provided;
- confirm release notes explain whether builds are signed;
- confirm no local config, cookies, API keys, notes, subtitles, or personal manifests are included.

## Rollback

If a release is wrong:

1. keep the tag for audit if already public;
2. mark the GitHub release as draft or delete the release asset;
3. publish a follow-up tag with a patch version;
4. rotate leaked credentials if any secret was exposed.

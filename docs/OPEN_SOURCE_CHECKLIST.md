# Open Source Checklist

Use this checklist before making 哔知 public.

## Repository Hygiene

- [ ] `git status --short` has no unexpected files.
- [ ] Generated runtime files are ignored.
- [ ] `BiliKnowledge/config/config.json` is not tracked.
- [ ] `BiliKnowledge/manifest/token_usage.json` is not tracked.
- [ ] `BiliKnowledgeApp/dist/` is not tracked.
- [ ] `BiliKnowledgeApp/src-tauri/target/` is not tracked.
- [ ] `.venv/`, model cache, logs, screenshots, DMG artifacts, and temporary files are not tracked.

## Sensitive Data

- [ ] Run `python3 tools/scan_sensitive.py` and `python3 tools/check_repo_hygiene.py`.
- [ ] Run `python3 BiliKnowledge/scripts/validate_knowledge_base.py --root BiliKnowledge`.
- [ ] Check screenshots and docs for Cookie/API Key exposure.
- [ ] Remove private research notes, competitor analysis, external project architecture reviews, and browser/Cookie investigation notes from public docs.
- [ ] Check Git history if secrets may have been committed before.
- [ ] Rotate any exposed token, Cookie, or API Key.

## Documentation

- [ ] `README.md` explains what the project does and does not do.
- [ ] `LICENSE` has correct copyright owner.
- [ ] `PRIVACY.md` explains local data and AI provider calls.
- [ ] `SECURITY.md` explains how to report vulnerabilities.
- [ ] `DISCLAIMER.md` explains platform, copyright, AI output, and cost boundaries.
- [ ] `CONTRIBUTING.md` contains validation commands.
- [ ] `CREDITS.md` and `CONTRIBUTING.md` credit direct open-source dependencies with author/organization links and upstream links.
- [ ] `docs/RELEASE.md` explains release workflow.

## Product Boundaries

- [ ] The README clearly says 哔知 is not a crawler.
- [ ] Recommended daily usage is documented.
- [ ] Bilibili usage boundary is documented.
- [ ] AI cost and Token usage boundary is documented.
- [ ] External AI provider data flow is documented.

## CI and Release

- [ ] CI passes on GitHub.
- [ ] Release workflow creates draft releases.
- [ ] macOS, Windows, and Linux packages are generated.
- [ ] Signing/notarization status is stated honestly.
- [ ] Draft release is reviewed before publishing.

## Final Human Review

- [ ] Install a fresh release package on a clean machine or test user.
- [ ] Run Doctor.
- [ ] Add one video manually.
- [ ] Fetch subtitle or run local ASR.
- [ ] Generate insight.
- [ ] Generate note.
- [ ] Verify note appears in notes list.
- [ ] Verify Token usage appears.
- [ ] Verify no background batch job starts unexpectedly.

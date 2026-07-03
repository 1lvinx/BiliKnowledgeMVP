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



## Attribution Rules for Contributions

Open-source attribution is part of the contribution requirements for 哔知. A contribution must make upstream authorship visible when it introduces or relies on third-party work.

When a PR adds any of the following, the PR must update the attribution table below or add a local license notice next to the relevant file:

- a new npm, Cargo, Python, system, or optional runtime dependency;
- copied, adapted, translated, or generated code based on another project;
- bundled icons, fonts, screenshots, templates, prompts, examples, datasets, or other assets;
- compatibility with a named third-party project or service;
- sample data that names a real third-party project, author, product, or repository.

Required attribution fields:

- upstream project name;
- original author, maintainer, or organization link;
- upstream repository or homepage link;
- license name and license file/link when available;
- whether the contribution uses the dependency normally, copies source/assets, adapts code, or only interoperates with an external tool.

Do not commit private research notes, competitor analysis, reverse-engineering notes, copied prompts, architecture tear-downs, or generated analysis of third-party projects. If a contribution is inspired by public documentation or a public project, describe the behavior at a product level and link the official source; do not paste private notes or implementation breakdowns into the repository.

PR authors should include an attribution note in the PR body whenever any of the bullets above apply. Maintainers should not merge attribution-affecting PRs until this section, `NOTICE.md`, or an adjacent license notice has been updated.

## Open Source Credits and Attribution

The current upstream open-source authors and organizations used by 哔知 are listed in [`CREDITS.md`](CREDITS.md). Keep that file current whenever a contribution adds or changes third-party dependencies, assets, examples, or integrations.

## Pull Requests

A good PR should include:

- a clear problem statement;
- a small focused change;
- screenshots for UI changes;
- validation commands and results;
- notes about privacy, token cost, or platform behavior if relevant;
- an attribution note for any new third-party dependency, copied/adapted material, bundled asset, sample data, or named integration;
- updates to the attribution table or local license notice when attribution changes.

## Python Interpreter

If your Python interpreter is not on `PATH`, set:

```bash
export BILIKNOWLEDGE_PYTHON=/absolute/path/to/python3
```

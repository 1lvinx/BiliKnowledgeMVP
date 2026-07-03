# Security Policy

## Supported Scope

Security-sensitive areas include:

- Bilibili Cookie storage and refresh logic;
- AI provider API key storage;
- Chrome Companion browser bridge;
- Tauri command allowlist and local script execution;
- generated subtitles, notes, token usage, and local manifests;
- release packaging and GitHub Actions secrets.

## Reporting a Vulnerability

Please do not open public issues for credential leaks, command execution concerns, or cookie handling vulnerabilities.

Report issues privately to the repository maintainer at [yolandear@gmail.com](mailto:yolandear@gmail.com) and include:

- affected version or commit;
- impact summary;
- reproduction steps;
- whether secrets, cookies, local files, or API keys may be exposed;
- suggested fix if available.

## Local Safety Expectations

- Never commit real Bilibili cookies or AI API keys.
- Never upload `BiliKnowledge/config/config.json`.
- Never share screenshots that expose Cookie, API Key, local paths, or private notes.
- Run `python3 BiliKnowledge/scripts/validate_knowledge_base.py --root BiliKnowledge` before publishing changes.
- Treat generated subtitles and notes as potentially private user data.

## GitHub Actions Secrets

Release workflows should store signing credentials, notarization credentials, and platform tokens only in GitHub Actions secrets. Do not hard-code secrets in workflow files.

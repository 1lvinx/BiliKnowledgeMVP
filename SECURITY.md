# Security Policy

## Supported Scope

This repository is intended for local-first desktop usage. Security-sensitive areas include:

- Stored Bilibili cookies in `BiliKnowledge/config/config.json`
- Any AI provider API keys stored in local config
- Tauri command allowlists and local script execution

## Reporting

Please do not open public issues for credential leaks or command-execution concerns.

Until a dedicated security contact is added, report issues privately to the repository maintainer and include:

- A short description of the impact
- Reproduction steps
- Whether secrets may have been exposed

## Local Safety Expectations

- Never commit real cookies or API keys
- Prefer local-only test credentials
- Re-run `python3 BiliKnowledge/scripts/validate_knowledge_base.py --root BiliKnowledge` before publishing changes

#!/usr/bin/env python3
"""Check local ASR runtime dependencies used by transcribe_subtitles.py."""
from __future__ import annotations

import importlib
import sys

REQUIRED_MODULES = [
    "yt_dlp",
    "funasr",
    "modelscope",
    "torch",
    "torchaudio",
    "pydub",
    "numpy",
]


def main() -> int:
    print(f"Python: {sys.executable}")
    failed = False
    for name in REQUIRED_MODULES:
        try:
            module = importlib.import_module(name)
            version = getattr(module, "__version__", "")
            print(f"[OK] {name} {version}".strip())
        except Exception as exc:  # noqa: BLE001 - diagnostics should show import root cause
            failed = True
            print(f"[FAIL] {name}: {type(exc).__name__}: {exc}")
    if failed:
        print("\n建议：source .venv/bin/activate && pip install 'numpy<2' yt-dlp funasr modelscope torch torchaudio pydub")
        return 1
    print("\nASR 环境可用。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

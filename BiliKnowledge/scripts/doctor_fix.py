#!/usr/bin/env python3
"""Repair wrapper for BiliKnowledge Doctor."""
from __future__ import annotations

from doctor import main
import sys

if __name__ == "__main__":
    sys.argv = [sys.argv[0], *sys.argv[1:], "--fix"]
    raise SystemExit(main())

#!/usr/bin/env python3
"""BiliKnowledge runtime doctor.

Checks local dependencies required for subtitle fetching, local ASR transcription,
and note generation. By default it only diagnoses. Use --fix to install/repair the
project virtual environment dependencies.
"""
from __future__ import annotations

import argparse
import importlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

ASR_REQUIREMENTS = [
    "numpy<2",
    "yt-dlp",
    "funasr",
    "modelscope",
    "torch==2.2.2",
    "torchaudio==2.2.2",
    "pydub",
]
REQUIRED_MODULES = ["yt_dlp", "funasr", "modelscope", "torch", "torchaudio", "pydub", "numpy"]
MODEL_CACHE_HINTS = [
    Path.home() / ".cache" / "modelscope" / "hub" / "models" / "iic" / "SenseVoiceSmall",
    Path.home() / ".cache" / "huggingface",
]


def status_line(ok: bool, label: str, detail: str = "") -> None:
    marker = "OK" if ok else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"[{marker}] {label}{suffix}")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def project_root_from_knowledge(root: Path) -> Path:
    root = root.resolve()
    return root.parent if root.name == "BiliKnowledge" else root


def venv_python(project_root: Path) -> Path:
    return project_root / ".venv" / "bin" / "python"


def run(cmd: list[str], cwd: Path | None = None) -> int:
    print("$ " + " ".join(cmd))
    return subprocess.call(cmd, cwd=str(cwd) if cwd else None)


def ensure_venv(project_root: Path, fix: bool) -> tuple[bool, Path]:
    python = venv_python(project_root)
    if python.exists():
        status_line(True, "项目虚拟环境", str(python))
        return True, python
    status_line(False, "项目虚拟环境", f"未找到 {python}")
    if not fix:
        print("  修复命令：python3 -m venv .venv")
        return False, python
    rc = run(["python3", "-m", "venv", ".venv"], cwd=project_root)
    ok = rc == 0 and python.exists()
    status_line(ok, "创建项目虚拟环境", str(python))
    return ok, python


def check_command(name: str) -> bool:
    path = shutil.which(name)
    status_line(bool(path), f"系统命令 {name}", path or "未安装或不在 PATH")
    return bool(path)


def check_modules(python: Path) -> bool:
    code = """
import importlib, json
mods = ['yt_dlp','funasr','modelscope','torch','torchaudio','pydub','numpy']
result = {}
for m in mods:
    try:
        module = importlib.import_module(m)
        result[m] = {'ok': True, 'version': getattr(module, '__version__', '')}
    except Exception as exc:
        result[m] = {'ok': False, 'error': f'{type(exc).__name__}: {exc}'}
print(json.dumps(result, ensure_ascii=False))
"""
    proc = subprocess.run([str(python), "-c", code], capture_output=True, text=True)
    if proc.returncode != 0:
        status_line(False, "Python 依赖导入", proc.stderr.strip()[-500:])
        return False
    try:
        result = json.loads(proc.stdout.strip().splitlines()[-1])
    except Exception:
        status_line(False, "Python 依赖导入", proc.stdout.strip()[-500:])
        return False
    ok = True
    for name in REQUIRED_MODULES:
        item = result.get(name, {})
        if item.get("ok"):
            status_line(True, f"Python 模块 {name}", str(item.get("version") or "已安装"))
        else:
            ok = False
            status_line(False, f"Python 模块 {name}", str(item.get("error") or "缺失"))
    numpy = result.get("numpy", {})
    if numpy.get("ok"):
        version = str(numpy.get("version") or "")
        if version.startswith("2."):
            ok = False
            status_line(False, "NumPy 兼容性", f"当前 {version}，建议 numpy<2")
        else:
            status_line(True, "NumPy 兼容性", version)
    return ok


def fix_modules(python: Path, project_root: Path) -> bool:
    pip = [str(python), "-m", "pip"]
    run(pip + ["install", "--upgrade", "pip"], cwd=project_root)
    rc = run(pip + ["install", *ASR_REQUIREMENTS], cwd=project_root)
    return rc == 0


def check_model_cache() -> bool:
    found = False
    for path in MODEL_CACHE_HINTS:
        if path.exists():
            found = True
            status_line(True, "模型缓存", str(path))
    if not found:
        status_line(False, "模型缓存", "首次本地转写会下载 SenseVoiceSmall 到 ~/.cache/modelscope")
    return True


def check_knowledge_root(root: Path) -> bool:
    ok = root.exists()
    status_line(ok, "知识库目录", str(root))
    for rel in ["manifest", "notes", "scripts", "projects"]:
        path = root / rel
        status_line(path.exists(), f"知识库子目录 {rel}", str(path))
        ok = ok and path.exists()
    config = load_json(root / "config" / "config.json", {})
    ai = config.get("ai") or {}
    status_line(bool(str(ai.get("api_key") or "").strip()), "AI API Key", "已配置" if str(ai.get("api_key") or "").strip() else "未配置，洞察/笔记会失败")
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="BiliKnowledge Doctor")
    parser.add_argument("--root", default=".", help="Knowledge base root directory")
    parser.add_argument("--fix", action="store_true", help="Create/repair .venv dependencies")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    project_root = project_root_from_knowledge(root)
    print("BiliKnowledge Doctor")
    print(f"Knowledge root: {root}")
    print(f"Project root:   {project_root}")
    print(f"Mode:           {'诊断 + 修复' if args.fix else '仅诊断'}")
    print("")

    ok = True
    ok = check_knowledge_root(root) and ok
    ok = check_command("ffmpeg") and ok
    venv_ok, python = ensure_venv(project_root, args.fix)
    ok = venv_ok and ok
    if venv_ok:
        module_ok = check_modules(python)
        if not module_ok and args.fix:
            print("\n[修复] 正在安装/修复 ASR 依赖...")
            module_ok = fix_modules(python, project_root) and check_modules(python)
        ok = module_ok and ok
    check_model_cache()

    print("")
    if ok:
        print("Doctor 结论：运行环境可用。")
        return 0
    print("Doctor 结论：发现问题。可点击修复或执行：python BiliKnowledge/scripts/doctor.py --root BiliKnowledge --fix")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

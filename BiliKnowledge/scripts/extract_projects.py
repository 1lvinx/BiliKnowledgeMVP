#!/usr/bin/env python3
"""Extract GitHub projects, tools, and frameworks from Markdown notes.

Phase 2: Tokenizer-based extraction to eliminate CLI flag false positives.
"""

import argparse
import html
import json
import re
import shlex
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional, Tuple

GITHUB_RE = r"https?://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"
GITHUB_NON_REPOS = frozenset({
    "settings", "topics", "orgs", "organizations", "marketplace",
    "pricing", "explore", "sponsors", "collections", "events",
    "features", "enterprise", "team", "new", "login", "signup",
    "notifications", "pulls", "issues", "stars", "watching",
})
GITLAB_RE = r"https?://gitlab\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"
HF_RE = r"https?://huggingface\.co/[A-Za-z0-9_./-]+"
GITHUB_API_REPO = "https://api.github.com/repos/{owner}/{repo}"

CLI_KEYWORDS = frozenset({
    "install", "add", "i", "run", "pull", "up", "compose",
    "pip", "pip3", "python", "python3", "npm", "npx", "pnpm", "yarn",
    "docker", "brew", "apt", "yum", "sudo", "cd", "mkdir", "cp", "mv",
    "rm", "cat", "echo", "grep", "sed", "awk", "curl", "wget",
    "git", "cargo", "go", "make", "cmake",
})

DOCKER_OPTIONS_WITH_VALUE = frozenset({
    "-p", "--publish",
    "-v", "--volume",
    "-e", "--env",
    "--env-file",
    "--name",
    "--network",
    "--platform",
    "--workdir", "-w",
    "--user", "-u",
    "--entrypoint",
    "--hostname", "-h",
    "--add-host",
    "--mount",
    "--label", "-l",
    "--restart",
    "--pull",
    "--cpus",
    "--memory", "-m",
})

DOCKER_BOOLEAN_FLAGS = frozenset({
    "--rm",
    "-i",
    "-t",
    "-it",
    "-ti",
    "-d",
    "--detach",
    "--privileged",
    "--init",
    "--tty",
    "--interactive",
    "--read-only",
    "--no-healthcheck",
})

DOCKER_SHORT_OPTIONS_WITH_ATTACHED_VALUE = ("-p", "-v", "-e", "-w", "-u", "-h", "-l", "-m")

PORT_MAPPING_RE = re.compile(r"(?:[0-9.]+:)?\d{1,5}:\d{1,5}(?:/(?:tcp|udp))?")


def is_cli_flag(token: str) -> bool:
    """Return True if token is a CLI flag (starts with -)."""
    return token.startswith("-")


def is_probable_package(token: str) -> bool:
    """Return True if token looks like a real package/image name."""
    if not token:
        return False
    if token.startswith("-"):
        return False
    if token in CLI_KEYWORDS:
        return False
    if token.endswith(".txt") or token.endswith(".cfg") or token.endswith(".toml"):
        return False
    if token.endswith(".py"):
        return False
    if PORT_MAPPING_RE.fullmatch(token):
        return False
    return True


def tokenize_command(text: str) -> list[str]:
    """Split shell command text into tokens."""
    try:
        return shlex.split(text.strip())
    except ValueError:
        return re.split(r"\s+", text.strip())


def extract_urls(text: str, pattern: str) -> list[str]:
    return list(set(re.findall(pattern, text)))


def infer_name_from_url(url: str) -> str:
    parts = url.rstrip("/").split("/")
    if len(parts) >= 2:
        return f"{parts[-2]}/{parts[-1]}"
    return parts[-1]


def parse_github_repo(url: str) -> Tuple[Optional[str], Optional[str]]:
    parts = url.rstrip("/").split("/")
    if len(parts) < 5 or "github.com" not in parts[2]:
        return None, None
    return parts[3], parts[4]


def parse_count(raw: str) -> int:
    text = (raw or "").strip().lower().replace(",", "")
    if not text:
        return 0
    multiplier = 1
    if text.endswith("k"):
        multiplier = 1000
        text = text[:-1]
    elif text.endswith("m"):
        multiplier = 1000000
        text = text[:-1]
    try:
        return int(float(text) * multiplier)
    except ValueError:
        return 0


def clean_text(raw: str) -> str:
    text = html.unescape((raw or "").strip())
    text = re.sub(r"\s+", " ", text)
    return text


def normalize_language(raw: str) -> str:
    value = clean_text(raw).lower()
    mapping = {
        "javascript": "JavaScript",
        "typescript": "TypeScript",
        "python": "Python",
        "go": "Go",
        "rust": "Rust",
        "html": "HTML",
        "css": "CSS",
        "c": "C",
        "c++": "C++",
        "c#": "C#",
    }
    return mapping.get(value, clean_text(raw))


def fetch_github_repo_metadata_from_html(url: str) -> dict:
    owner, repo = parse_github_repo(url)
    if not owner or not repo:
        return {}
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            html = response.read().decode("utf-8", errors="ignore")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return {}

    title_match = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
    desc_match = re.search(r'<meta property="og:description" content="([^"]+)"', html, re.I)
    stars_match = re.search(r'aria-label="([0-9.,kKmM]+) users starred this repository"', html, re.I)
    forks_match = re.search(r'<h3 class="sr-only">Forks</h3>[\s\S]{0,500}?<strong>([0-9.,kKmM]+)</strong>', html, re.I)
    watchers_match = re.search(r'watching</a>', html, re.I)
    watchers_count_match = None
    if watchers_match:
        snippet = html[max(0, watchers_match.start() - 500):watchers_match.end()]
        watchers_count_match = re.search(r"<strong>([0-9.,kKmM]+)</strong>", snippet, re.I)
    language_match = re.search(r'/search\?l=([a-z0-9+_-]+)"', html, re.I)
    updated_match = re.search(r'<relative-time datetime="([^"]+)"', html, re.I)

    clean_title = ""
    if title_match:
        clean_title = re.sub(r"\s*· GitHub\s*$", "", clean_text(title_match.group(1)))

    return {
        "repo_full_name": f"{owner}/{repo}",
        "description": clean_text(desc_match.group(1)) if desc_match else "",
        "stars": parse_count(stars_match.group(1)) if stars_match else 0,
        "forks": parse_count(forks_match.group(1)) if forks_match else 0,
        "watchers": parse_count(watchers_count_match.group(1)) if watchers_count_match else 0,
        "language": normalize_language(language_match.group(1)) if language_match else "",
        "html_url": url,
        "page_title": clean_title,
        "pushed_at": clean_text(updated_match.group(1)) if updated_match else "",
    }


def fetch_github_repo_metadata(url: str) -> dict:
    owner, repo = parse_github_repo(url)
    if not owner or not repo:
        return {}

    api_url = GITHUB_API_REPO.format(owner=owner, repo=repo)
    request = urllib.request.Request(
        api_url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "BiliKnowledgeLocal/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return fetch_github_repo_metadata_from_html(url)

    return {
        "repo_full_name": payload.get("full_name", ""),
        "description": clean_text(payload.get("description") or ""),
        "homepage": payload.get("homepage") or "",
        "stars": int(payload.get("stargazers_count") or 0),
        "forks": int(payload.get("forks_count") or 0),
        "watchers": int(payload.get("subscribers_count") or payload.get("watchers_count") or 0),
        "open_issues": int(payload.get("open_issues_count") or 0),
        "language": normalize_language(payload.get("language") or ""),
        "license": ((payload.get("license") or {}).get("spdx_id") or ""),
        "topics": payload.get("topics") or [],
        "archived": bool(payload.get("archived") or False),
        "default_branch": payload.get("default_branch") or "",
        "pushed_at": payload.get("pushed_at") or "",
        "html_url": payload.get("html_url") or url,
    }


def extract_pip_packages(text: str) -> list[str]:
    """Extract pip package names, skipping flags and requirement files."""
    results = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Match pip install [flags] package1 package2 ...
        m = re.search(r"python[3]?\s+-m\s+pip\s+install|pip3?\s+install", line)
        if not m:
            continue
        after = line[m.end():]
        tokens = tokenize_command(after)
        for tok in tokens:
            if is_probable_package(tok):
                results.append(tok)
    return list(set(results))


def extract_npm_packages(text: str) -> list[str]:
    """Extract npm/pnpm/yarn package names, skipping flags."""
    results = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        m = re.search(r"(?:npm\s+(?:install|i)|pnpm\s+add|yarn\s+add)", line)
        if not m:
            continue
        after = line[m.end():]
        tokens = tokenize_command(after)
        for tok in tokens:
            if is_probable_package(tok):
                results.append(tok)
    return list(set(results))


def is_invalid_docker_image_candidate(token: str) -> bool:
    """Return True for Docker args that cannot be image references."""
    if not token:
        return True
    if token.startswith("-"):
        return True
    if token in CLI_KEYWORDS:
        return True
    if token.startswith(("http://", "https://")) or "://" in token:
        return True
    if "=" in token:
        return True
    if token.startswith(("./", "../", "/", "~")) and ":" in token:
        return True
    if PORT_MAPPING_RE.fullmatch(token):
        return True
    return False


def is_probable_docker_image(token: str) -> bool:
    return is_probable_package(token) and not is_invalid_docker_image_candidate(token)


def docker_option_consumes_value(token: str) -> bool:
    if token in DOCKER_OPTIONS_WITH_VALUE:
        return True
    if "=" in token and token.split("=", 1)[0] in DOCKER_OPTIONS_WITH_VALUE:
        return False
    return any(
        token.startswith(prefix) and token != prefix
        for prefix in DOCKER_SHORT_OPTIONS_WITH_ATTACHED_VALUE
    )


def extract_docker_images_from_command(command: str) -> list[str]:
    """Extract Docker image references from one docker run/pull command."""
    tokens = tokenize_command(command.strip().lstrip("$ "))
    if "docker" not in tokens:
        return []

    docker_index = tokens.index("docker")
    if len(tokens) <= docker_index + 1:
        return []

    subcommand = tokens[docker_index + 1]
    if subcommand not in {"run", "pull"}:
        return []

    i = docker_index + 2
    while i < len(tokens):
        token = tokens[i]

        if token in DOCKER_BOOLEAN_FLAGS:
            i += 1
            continue

        if token in DOCKER_OPTIONS_WITH_VALUE:
            i += 2
            continue

        if "=" in token and token.split("=", 1)[0] in DOCKER_OPTIONS_WITH_VALUE:
            i += 1
            continue

        if docker_option_consumes_value(token):
            i += 1
            continue

        if token.startswith("-"):
            i += 1
            continue

        if is_probable_docker_image(token):
            return [token]

        i += 1

    return []


def extract_docker_images(text: str) -> list[str]:
    """Extract Docker image names, skipping options and option values."""
    results = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        results.extend(extract_docker_images_from_command(line))
    return list(set(results))


def scan_notes(notes_dir: str) -> list[tuple[Path, str]]:
    notes_path = Path(notes_dir)
    if not notes_path.exists():
        print(f"[错误] 未找到笔记目录：{notes_dir}")
        sys.exit(1)
    results = []
    for f in sorted(notes_path.glob("*.md")):
        content = f.read_text(encoding="utf-8")
        results.append((f, content))
    print(f"[SCAN] Found {len(results)} notes in {notes_dir}")
    return results


def extract_projects(notes: list[tuple[Path, str]]) -> dict:
    github_projects = []
    tools = []
    seen = set()
    github_meta_cache: dict[str, dict] = {}

    for note_path, content in notes:
        source_note = str(note_path.name)
        source_video = ""
        m = re.search(r"(https?://www\.bilibili\.com/video/\S+)", content)
        if m:
            source_video = m.group(1).rstrip(")")

        def _add_project(url, ptype="github"):
            if url in seen:
                return
            seen.add(url)
            repo_metadata = {}
            if ptype == "github":
                repo_metadata = github_meta_cache.get(url)
                if repo_metadata is None:
                    repo_metadata = {}
                if not repo_metadata:
                    repo_metadata = fetch_github_repo_metadata(url)
                    github_meta_cache[url] = repo_metadata
            github_projects.append({
                "name": repo_metadata.get("repo_full_name") or infer_name_from_url(url),
                "url": repo_metadata.get("html_url") or url,
                "source_note": source_note,
                "source_video": source_video,
                "type": ptype,
                "tech_stack": repo_metadata.get("topics") or [],
                "description": repo_metadata.get("description") or "",
                "mentioned_context": "",
                "reusable_value": "",
                "commercial_value": "",
                "risk": "",
                "priority": "P1",
                "status": "candidate",
                "need_verify": True,
                "homepage": repo_metadata.get("homepage") or "",
                "stars": repo_metadata.get("stars") or 0,
                "forks": repo_metadata.get("forks") or 0,
                "watchers": repo_metadata.get("watchers") or 0,
                "open_issues": repo_metadata.get("open_issues") or 0,
                "language": repo_metadata.get("language") or "",
                "license": repo_metadata.get("license") or "",
                "archived": repo_metadata.get("archived") or False,
                "default_branch": repo_metadata.get("default_branch") or "",
                "pushed_at": repo_metadata.get("pushed_at") or "",
            })

        def _add_tool(name, url, tool_type, category):
            key = f"{tool_type}:{name}"
            if key in seen:
                return
            seen.add(key)
            tools.append({
                "name": name,
                "url": url,
                "source_note": source_note,
                "type": tool_type,
                "category": category,
            })

        # GitHub repos
        for url in extract_urls(content, GITHUB_RE):
            # Filter out non-repo paths
            parts = url.rstrip("/").split("/")
            if len(parts) >= 5 and parts[3] in GITHUB_NON_REPOS:
                continue
            _add_project(url, "github")

        # GitLab repos
        for url in extract_urls(content, GITLAB_RE):
            _add_project(url, "gitlab")

        # HuggingFace
        for url in extract_urls(content, HF_RE):
            _add_tool(url.split("/")[-1], url, "huggingface", "AI模型")

        # pip packages (tokenizer-based)
        for pkg in extract_pip_packages(content):
            _add_tool(pkg, f"https://pypi.org/project/{pkg}/", "pip", "Python包")

        # npm/pnpm/yarn packages (tokenizer-based)
        for pkg in extract_npm_packages(content):
            _add_tool(pkg, f"https://www.npmjs.com/package/{pkg}", "npm", "Node包")

        # Docker images (tokenizer-based)
        for img in extract_docker_images(content):
            _add_tool(img, f"https://hub.docker.com/r/{img}", "docker", "Docker镜像")

    return {"github_projects": github_projects, "tools": tools}


def self_test():
    """Run built-in tests to verify extraction correctness."""
    print("[SELF-TEST] Running extraction tests...\n")
    passed = 0
    failed = 0

    def check(name, condition):
        nonlocal passed, failed
        if condition:
            print(f"  PASS: {name}")
            passed += 1
        else:
            print(f"  FAIL: {name}")
            failed += 1

    # Docker flag test
    docker_text = "docker run -d --name app -p 8080:80 postgres:16"
    docker_imgs = extract_docker_images(docker_text)
    check("docker -d not extracted", "-d" not in docker_imgs)
    check("docker --name not extracted", "--name" not in docker_imgs)
    check("docker --name value not extracted", "app" not in docker_imgs)
    check("docker -p not extracted", "-p" not in docker_imgs)
    check("docker port mapping not extracted", "8080:80" not in docker_imgs)
    check("docker postgres:16 extracted", "postgres:16" in docker_imgs)

    # Docker with registry
    docker_text2 = "docker run ghcr.io/user/project:latest"
    docker_imgs2 = extract_docker_images(docker_text2)
    check("docker ghcr.io image extracted", "ghcr.io/user/project:latest" in docker_imgs2)

    # Docker option value regression tests
    docker_cases = [
        ("docker run -p 3000:3000 nginx:latest", "nginx:latest", ["3000:3000"]),
        (
            "docker run --rm -it -p 127.0.0.1:8080:80 ghcr.io/user/app:latest",
            "ghcr.io/user/app:latest",
            ["127.0.0.1:8080:80"],
        ),
        (
            "docker run -v ./data:/data -e NODE_ENV=production node:20-alpine",
            "node:20-alpine",
            ["./data:/data", "NODE_ENV=production"],
        ),
        ("docker run --name redis -p 6379:6379 redis:7", "redis:7", ["redis", "6379:6379"]),
        ("docker pull postgres:16", "postgres:16", []),
    ]
    for command, expected, banned_tokens in docker_cases:
        images = extract_docker_images(command)
        check(f"docker expected image extracted: {expected}", expected in images)
        for banned in banned_tokens:
            check(f"docker non-image skipped: {banned}", banned not in images)

    # npm flag test
    npm_text = "npm install -g @anthropic-ai/claude-code"
    npm_pkgs = extract_npm_packages(npm_text)
    check("npm -g not extracted", "-g" not in npm_pkgs)
    check("npm scoped package extracted", "@anthropic-ai/claude-code" in npm_pkgs)

    # npm multiple packages
    npm_text2 = "npm install react @vitejs/plugin-react --save-dev"
    npm_pkgs2 = extract_npm_packages(npm_text2)
    check("npm react extracted", "react" in npm_pkgs2)
    check("npm --save-dev not extracted", "--save-dev" not in npm_pkgs2)

    # pip flag test
    pip_text = "pip install -r requirements.txt fastapi"
    pip_pkgs = extract_pip_packages(pip_text)
    check("pip -r not extracted", "-r" not in pip_pkgs)
    check("pip requirements.txt not extracted", "requirements.txt" not in pip_pkgs)
    check("pip fastapi extracted", "fastapi" in pip_pkgs)

    # pip multiple packages
    pip_text2 = "pip install langchain chromadb fastapi uvicorn"
    pip_pkgs2 = extract_pip_packages(pip_text2)
    check("pip langchain extracted", "langchain" in pip_pkgs2)
    check("pip chromadb extracted", "chromadb" in pip_pkgs2)

    # pip3 and python -m pip
    pip_text3 = "pip3 install requests\npython -m pip install httpx"
    pip_pkgs3 = extract_pip_packages(pip_text3)
    check("pip3 requests extracted", "requests" in pip_pkgs3)
    check("python -m pip httpx extracted", "httpx" in pip_pkgs3)

    # Port mapping false-positive tests (npm/pip)
    npm_port = extract_npm_packages("npm install 3000:3000 react")
    check("npm port mapping not extracted", "3000:3000" not in npm_port)
    pip_port = extract_pip_packages("pip install 8080:80 fastapi")
    check("pip port mapping not extracted", "8080:80" not in pip_port)

    # GitHub extraction
    github_text = "项目地址：https://github.com/karakeep-app/karakeep"
    github_urls = extract_urls(github_text, GITHUB_RE)
    check("github url extracted", "https://github.com/karakeep-app/karakeep" in github_urls)

    # Negative: github settings page (filtered at project level)
    github_neg = "https://github.com/settings/tokens"
    github_urls_neg = extract_urls(github_neg, GITHUB_RE)
    # Raw regex matches it, but extract_projects filters it out
    parts = github_urls_neg[0].rstrip("/").split("/") if github_urls_neg else []
    is_filtered = len(parts) >= 5 and parts[3] in GITHUB_NON_REPOS
    check("github settings filtered at project level", is_filtered)

    print(f"\n[自检] 通过 {passed} 项，失败 {failed} 项")
    return failed == 0


def write_project_candidates(projects, output_dir):
    path = output_dir / "project_candidates.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(projects, f, ensure_ascii=False, indent=2)
    print(f"[已写入] {path}（共 {len(projects)} 个项目）")


def write_github_projects_md(projects, output_dir):
    lines = [
        "# GitHub 项目清单\n",
        "| # | 项目 | Star | 语言 | 链接 | 来源视频 | 状态 |",
        "|---|---|---|---|---|---|---|",
    ]
    for i, p in enumerate(projects, 1):
        source = p.get("source_video", p.get("source_note", ""))
        lines.append(
            f"| {i} | {p['name']} | {p.get('stars', 0)} | {p.get('language', '') or '-'} | "
            f"{p['url']} | {source} | {p.get('status', 'candidate')} |"
        )
    path = output_dir / "github_projects.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[已写入] {path}")


def write_open_source_tools_md(tools, output_dir):
    categories = {}
    for t in tools:
        cat = t.get("category", "其他")
        categories.setdefault(cat, []).append(t)

    lines = ["# 开源工具清单\n"]
    for cat, items in categories.items():
        lines.append(f"## {cat}\n")
        lines.append("| 工具 | 类型 | 用途 | 来源 | 是否需验证 |")
        lines.append("|---|---|---|---|---|")
        for t in items:
            lines.append(f"| {t['name']} | {t['type']} |  | {t['source_note']} | 是 |")
        lines.append("")

    path = output_dir / "open_source_tools.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"[已写入] {path}")


def write_karakeep_import(projects, output_dir):
    lines = ["url,title,tags,note"]
    for p in projects:
        tags = f"github,from-bilibili,{p.get('type', 'project')}"
        note = f"来源：{p.get('source_note', '')}；用途：待验证"
        lines.append(f'{p["url"]},{p["name"]},"{tags}","{note}"')
    path = output_dir / "karakeep_import.csv"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[已写入] {path}")


def main():
    parser = argparse.ArgumentParser(description="提取项目候选")
    parser.add_argument("--notes", default="notes/raw", help="Markdown notes directory")
    parser.add_argument("--output", default="projects", help="Output directory")
    parser.add_argument("--dry-run", action="store_true", help="Preview only")
    parser.add_argument("--self-test", action="store_true", help="Run built-in tests")
    args = parser.parse_args()

    if args.self_test:
        success = self_test()
        sys.exit(0 if success else 1)

    notes = scan_notes(args.notes)
    if not notes:
        print("[提示] 未找到笔记，无需提取项目。")
        sys.exit(0)

    result = extract_projects(notes)
    github = result["github_projects"]
    tools = result["tools"]

    print(f"\n[提取] 共识别 {len(github)} 个项目、{len(tools)} 个工具/包")

    if args.dry_run:
        print("\n[预览] 项目候选：")
        for p in github[:5]:
            print(f"  - {p['name']}: {p['url']}")
        print(f"\n[预览] 工具与包：")
        for t in tools[:5]:
            print(f"  - {t['name']}: {t['url']}")
        print("\n[预览] 本次未写入文件。")
        return

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    write_project_candidates(github, out)
    write_github_projects_md(github, out)
    write_open_source_tools_md(tools, out)
    write_karakeep_import(github, out)
    print(f"\n[完成] 项目候选已输出到 {out}/")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generate index.md and execution report for the knowledge base."""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def count_notes(notes_dir):
    p = Path(notes_dir)
    if not p.exists():
        return 0
    return len(list(p.glob("*.md")))


def build_index(root):
    root = Path(root)
    manifest_path = root / "manifest" / "videos.json"
    notes_dir = root / "notes" / "raw"
    projects_dir = root / "projects"
    thoughts_dir = root / "thoughts"

    # Load manifest
    videos = []
    if manifest_path.exists():
        videos = load_json(manifest_path)

    note_count = count_notes(notes_dir)

    # Count projects
    project_files = list(projects_dir.glob("*.md")) if projects_dir.exists() else []
    project_count = len(project_files)

    # Count thoughts
    thought_files = list(thoughts_dir.glob("*.md")) if thoughts_dir.exists() else []
    thought_count = len(thought_files)

    # Priority stats
    p_counts = {}
    for v in videos:
        p = v.get("priority", "unknown")
        p_counts[p] = p_counts.get(p, 0) + 1

    # Category stats
    cat_counts = {}
    for v in videos:
        c = v.get("category", "未分类")
        cat_counts[c] = cat_counts.get(c, 0) + 1

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    lines = [
        "# B站收藏夹知识库索引",
        "",
        f"> 最后更新: {now}",
        "",
        "---",
        "",
        "## 统计概览",
        "",
        f"| 指标 | 数值 |",
        f"|---|---|",
        f"| 视频总数 | {len(videos)} |",
        f"| 笔记数量 | {note_count} |",
        f"| 项目文件 | {project_count} |",
        f"| 想法文件 | {thought_count} |",
        "",
        "### 优先级分布",
        "",
        "| 优先级 | 数量 |",
        "|---|---|",
    ]
    for p in ["P0", "P1", "P2"]:
        lines.append(f"| {p} | {p_counts.get(p, 0)} |")

    lines.extend([
        "",
        "### 分类分布",
        "",
        "| 分类 | 数量 |",
        "|---|---|",
    ])
    for cat, count in sorted(cat_counts.items(), key=lambda x: -x[1]):
        lines.append(f"| {cat} | {count} |")

    lines.extend([
        "",
        "---",
        "",
        "## 最近处理视频",
        "",
        "| # | 标题 | 分类 | 优先级 | 状态 |",
        "|---|---|---|---|---|",
    ])
    for i, v in enumerate(videos[:10], 1):
        title = v.get("title", "")[:40]
        cat = v.get("category", "")
        pri = v.get("priority", "")
        status = v.get("status", "pending")
        url = v.get("url", "")
        lines.append(f"| {i} | [{title}]({url}) | {cat} | {pri} | {status} |")

    lines.extend([
        "",
        "---",
        "",
        "## 开源项目索引",
        "",
        "- [GitHub 项目清单](projects/github_projects.md)",
        "- [开源工具清单](projects/open_source_tools.md)",
        "",
        "## 想法索引",
        "",
        "- [产品想法](thoughts/product_ideas.md)",
        "- [AI 工作流想法](thoughts/ai_workflow_ideas.md)",
        "- [商业化想法](thoughts/business_ideas.md)",
        "",
        "## 处理状态",
        "",
        "见：`manifest/processing_status.json`",
    ])

    return "\n".join(lines) + "\n"


def build_report(root, index_content):
    root = Path(root)
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    report = f"""# BiliKnowledge 执行报告

生成时间: {now}

## 执行摘要

- 工作区: {root}
- 知识库根目录: {root}

## 目录结构

```
BiliKnowledge/
├── config/           # 配置文件
├── manifest/         # 视频清单
│   └── source/       # bilibili-favorites 原始输出
├── notes/
│   ├── raw/          # 原始视频笔记
│   └── reviewed/     # 人工复核笔记
├── projects/         # 项目提取
├── thoughts/         # 想法整理
├── scripts/          # 数据处理流程
├── reports/          # 执行报告
└── index.md          # 知识库索引
```

## 已完成流程

| 流程 | 用途 | 状态 |
|---|---|---|
| 导入收藏 | 解析收藏夹 → manifest | 已验证 |
| 提取项目 | 从笔记提取项目 | 待验证 |
| 构建索引 | 生成索引 | 待验证 |
| 健康检查 | 质量检查 | 待验证 |

## 下一步

1. 提供真实 B 站 Cookie 运行导入、分析与分类流程
2. 运行项目提取流程获取真实项目
3. 人工复核笔记
4. 运行健康检查流程质检
5. 导入 Karakeep
"""
    return report


def main():
    parser = argparse.ArgumentParser(description="构建索引与报告")
    parser.add_argument("--root", default=".", help="Knowledge base root directory")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    print(f"[工作区] {root}")

    # Build index
    index_content = build_index(root)
    index_path = root / "index.md"
    index_path.write_text(index_content, encoding="utf-8")
    print(f"[已写入] {index_path}")

    # Build report
    report_content = build_report(root, index_content)
    report_path = root / "reports" / "execution_report.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report_content, encoding="utf-8")
    print(f"[已写入] {report_path}")

    print("\n[完成] 索引与报告已生成。")


if __name__ == "__main__":
    main()

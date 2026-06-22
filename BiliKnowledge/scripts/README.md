# BiliKnowledge Scripts

## 脚本说明

| 脚本 | 用途 | 用法 |
|---|---|---|
| parse_favorites.py | 解析 bilibili-favorites 输出 → manifest | `python scripts/parse_favorites.py --input manifest/source --output manifest --limit 50` |
| generate_insights.py | 使用已配置 AI 生成视频摘要/要点/标签 | `python scripts/generate_insights.py --root . --limit 30` |
| fetch_subtitles.py | 抓取 Bilibili 原生/AI 字幕到本地 | `python scripts/fetch_subtitles.py --root . --video-id BVxxxx` |
| generate_notes.py | 根据视频/字幕/洞察生成基础 Markdown 笔记 | `python scripts/generate_notes.py --root . --limit 30` |
| extract_projects.py | 从笔记提取 GitHub/工具/框架 | `python scripts/extract_projects.py --notes notes/raw --output projects` |
| build_index.py | 生成 index.md 和执行报告 | `python scripts/build_index.py --root .` |
| validate_knowledge_base.py | 质量检查和敏感信息扫描 | `python scripts/validate_knowledge_base.py --root .` |

## 注意事项

- 所有脚本支持 `--dry-run` 参数
- 不要在脚本中硬编码 Cookie 或 API Key
- 运行前先检查 bilibili-favorites 的 README

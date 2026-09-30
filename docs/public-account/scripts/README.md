# 哔知本地公众号排版器

这个脚本用于替代外部 `md2wechat.cn` API。

特点：

- 不需要 API Key
- 不需要大模型
- 不依赖外部网站
- 只使用 Node.js 内置模块
- 默认固定使用公众号常用模板：`bizhi-classic`

## 内置模板

当前内置 4 个模板：

| 模板 ID | 名称 | 适合场景 |
|---|---|---|
| `bizhi-classic` | 哔知经典蓝 · 固定公众号模板 | 默认模板。适合产品开发记录、AI 工具复盘、知识库文章 |
| `ink-serif` | 墨色长文 · 宋体阅读模板 | 深度随笔、观点长文 |
| `tech-card` | 技术卡片 · 工具教程模板 | 教程、步骤、项目清单 |
| `warm-note` | 暖色手记 · 开发日志模板 | 复盘、踩坑、阶段记录 |

查看模板：

```bash
node docs/public-account/scripts/render-wechat-local.mjs --list-templates
```

## 常用命令

生成第 4-10 篇，并同步到桌面：

```bash
node docs/public-account/scripts/render-wechat-local.mjs docs/public-account/bizhi-series/{04,05,06,07,08,09,10}-*.md --desktop-dir "$HOME/Desktop/哔知公众号第4-10篇-本地排版"
```

指定模板：

```bash
node docs/public-account/scripts/render-wechat-local.mjs docs/public-account/bizhi-series/{04,05,06,07,08,09,10}-*.md --template bizhi-classic
```

输出：

- `docs/public-account/bizhi-series/local-wechat-rendered/html/`：公众号正文 HTML 片段
- `docs/public-account/bizhi-series/local-wechat-rendered/preview/`：浏览器预览页，带复制按钮
- `docs/public-account/bizhi-series/local-wechat-rendered/index.html`：预览入口

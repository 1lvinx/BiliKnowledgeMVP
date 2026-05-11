# FastAPI + SQLAlchemy 2.0 异步ORM最佳实践

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| 视频标题 | FastAPI + SQLAlchemy 2.0 异步ORM最佳实践 |
| 视频链接 | https://www.bilibili.com/video/BV1sT0g9M5cD |
| BV号 | BV1sT0g9M5cD |
| UP主 | Python后端日记 |
| 收藏夹 | 后端开发 |
| 分类 | 后端开发 |
| 处理日期 | 2026-05-06 |
| 处理状态 | 已完成 |

---

## 2. 一句话结论

> FastAPI 异步架构 + SQLAlchemy 2.0 async session + 连接池优化，是 Python 后端的最佳实践。

---

## 4. 视频中提到的开源项目 / 工具 / 框架

| 名称 | 链接 | 类型 | 用途 | 是否值得深入 |
|---|---|---|---|---|
| FastAPI | https://github.com/tiangolo/fastapi | Python框架 | 异步API框架 | 是 |
| SQLAlchemy | https://github.com/sqlalchemy/sqlalchemy | Python库 | 异步ORM | 是 |
| Uvicorn | https://github.com/encode/uvicorn | ASGI服务器 | 异步服务器 | 是 |

---

## 5. 可执行信息

### 5.1 命令

```bash
pip install fastapi sqlalchemy[asyncio] uvicorn asyncpg
```

---

## 6. 我的想法

### 6.1 可以复用的点

- SQLAlchemy 2.0 async session 模式可以直接用于 BiliKnowledge 后端

### 6.3 后续行动

| 行动 | 优先级 | 备注 |
|---|---|---|
| 将异步ORM模式应用于项目 | P1 | 性能优化 |

---

## 8. 标签

`#B站` `#视频笔记` `#FastAPI` `#SQLAlchemy` `#Python`

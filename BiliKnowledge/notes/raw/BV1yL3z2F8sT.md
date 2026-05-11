# RAG系统实战：从向量数据库到生产部署

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| 视频标题 | RAG系统实战：从向量数据库到生产部署 |
| 视频链接 | https://www.bilibili.com/video/BV1yL3z2F8sT |
| BV号 | BV1yL3z2F8sT |
| UP主 | 全栈AI笔记 |
| 收藏夹 | AI工具 |
| 分类 | AI技术 |
| 处理日期 | 2026-05-06 |
| 处理状态 | 已完成 |

---

## 2. 一句话结论

> RAG 完整链路：文档解析 → Embedding → 向量库 → 检索 → 生成，使用 LangChain + FastAPI 实现生产级部署。

---

## 3. 核心内容摘要

### 3.1 主要观点

- RAG 的核心是「检索增强生成」，先找到相关文档，再让 LLM 基于文档回答
- 向量数据库选型：Chroma（轻量）→ Qdrant（生产）→ Pinecone（全托管）
- 文档分块策略直接影响检索质量

### 3.2 关键步骤 / 方法

1. 文档加载与分块（RecursiveCharacterTextSplitter）
2. Embedding 生成（OpenAI / 本地模型）
3. 向量存储（Chroma / Qdrant）
4. 检索链构建（Similarity Search + MMR）
5. FastAPI 部署为 REST API

### 3.3 重要概念

| 概念 | 解释 | 价值 |
|---|---|---|
| Chunking | 将长文档切分为小段，提高检索精度 | 核心技术 |
| MMR | 最大边际相关性，平衡相关性和多样性 | 检索优化 |
| Hybrid Search | 关键词+向量混合检索 | 生产推荐 |

---

## 4. 视频中提到的开源项目 / 工具 / 框架

| 名称 | 链接 | 类型 | 用途 | 是否值得深入 |
|---|---|---|---|---|
| LangChain | https://github.com/langchain-ai/langchain | Python框架 | LLM应用开发 | 是 |
| Chroma | https://github.com/chroma-core/chroma | 向量数据库 | 轻量级向量存储 | 是 |
| Qdrant | https://github.com/qdrant/qdrant | 向量数据库 | 生产级向量检索 | 是 |
| FastAPI | https://github.com/tiangolo/fastapi | Python框架 | API部署 | 是 |

---

## 5. 可执行信息

### 5.1 命令

```bash
pip install langchain chromadb fastapi uvicorn
pip install langchain-community
```

---

## 6. 我的想法

### 6.1 可以复用的点

- RAG pipeline 可以直接用于 BiliKnowledge 的视频笔记检索

### 6.2 可以做成产品/服务的点

- 「企业知识库 RAG 服务」：帮企业搭建内部知识库问答系统

### 6.3 后续行动

| 行动 | 优先级 | 备注 |
|---|---|---|
| 将RAG应用于BiliKnowledge笔记检索 | P1 | 提升知识库可用性 |

---

## 7. 风险与不确定项

| 项目 | 风险 | 是否需验证 |
|---|---|---|
| 分块策略选择 | 不同文档类型需要不同策略 | 是 |

---

## 8. 标签

`#B站` `#视频笔记` `#RAG` `#向量数据库` `#LangChain`

# 短视频AI自动剪辑工作流：从素材到成片

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| 视频标题 | 短视频AI自动剪辑工作流：从素材到成片 |
| 视频链接 | https://www.bilibili.com/video/BV1tU1h0N6dE |
| BV号 | BV1tU1h0N6dE |
| UP主 | AI创作工坊 |
| 收藏夹 | 内容创作 |
| 分类 | 内容创作 |
| 处理日期 | 2026-05-06 |
| 处理状态 | 已完成 |

---

## 2. 一句话结论

> Whisper 转录 + GPT 脚本 + TTS 配音 + FFmpeg 剪辑，实现短视频全自动生产流水线。

---

## 4. 视频中提到的开源项目 / 工具 / 框架

| 名称 | 链接 | 类型 | 用途 | 是否值得深入 |
|---|---|---|---|---|
| Whisper | https://github.com/openai/whisper | Python库 | 语音转录 | 是 |
| edge-tts | https://github.com/rany2/edge-tts | Python库 | TTS配音 | 是 |
| FFmpeg | https://github.com/FFmpeg/FFmpeg | CLI工具 | 视频剪辑 | 是 |
| ffmpeg-python | https://github.com/kkroening/ffmpeg-python | Python库 | FFmpeg绑定 | 是 |

---

## 5. 可执行信息

### 5.1 命令

```bash
pip install whisper edge-tts ffmpeg-python
```

---

## 6. 我的想法

### 6.1 可以复用的点

- Whisper + TTS 可以用于 BiliKnowledge 的视频笔记语音化

### 6.2 可以做成产品/服务的点

- 「AI短视频自动生产服务」：帮内容创作者批量生产短视频

### 6.3 后续行动

| 行动 | 优先级 | 备注 |
|---|---|---|
| 评估Whisper转录集成 | P2 | 可选功能 |

---

## 8. 标签

`#B站` `#视频笔记` `#Whisper` `#TTS` `#自动化`

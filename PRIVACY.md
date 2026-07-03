# Privacy Policy

哔知是一个本地优先的桌面应用。默认情况下，知识库、字幕、笔记、项目候选、想法和运行记录都保存在用户本机。

## Local Data

哔知可能在本地保存以下数据：

- B 站视频清单、收藏夹名称和视频元数据；
- B 站 Cookie 字段，例如 `SESSDATA`、`bili_jct`、`DedeUserID`；
- AI provider API Key、base URL、model 配置；
- 抓取或本地转写的字幕；
- AI 生成的视频洞察和 Markdown 笔记；
- 从笔记中识别出的 GitHub 项目候选；
- 用户手动写入的想法和标签；
- 每条视频的 Token 用量记录；
- Doctor 诊断结果和本地日志。

这些数据默认位于 `BiliKnowledge/` 目录或用户指定的 `BILIKNOWLEDGE_ROOT`。

## External Services

当用户配置外部 AI 服务时，哔知会把必要的字幕、视频元数据、笔记草稿或项目匹配上下文发送给该服务，用于生成洞察、笔记或项目匹配结果。

实际发送内容取决于用户触发的功能和所配置的模型服务商。请在使用前阅读对应模型服务商的隐私政策和计费规则。

## Bilibili Login Data

B 站 Cookie 仅用于用户本人授权的登录态验证、字幕获取、收藏夹同步和相关元数据请求。哔知不提供绕过平台限制的能力，也不建议高频批量抓取。

## Token Metering

哔知会记录模型调用的 token 用量，用于成本提示和透明化展示。该记录不等于最终账单；实际费用以用户所配置模型服务商的账单为准。

## Data Sharing

哔知不会主动上传用户知识库到本项目作者的服务器。本项目也不内置作者侧遥测服务。

如果用户自行配置第三方 AI 服务、代理、同步盘或备份工具，相关数据流转由用户自行负责。

## Before Sharing Logs or Screenshots

请先检查是否包含：

- B 站 Cookie；
- AI API Key；
- 私人笔记；
- 字幕全文；
- 本地绝对路径；
- 模型服务响应；
- GitHub 或 WeChat 等平台凭据。

## Contact

如果你发现隐私或安全问题，请按 [SECURITY.md](SECURITY.md) 中的方式联系维护者。

# 哔知助手（Bili Knowledge Companion）

Chrome Extension MV3，用于把当前 B 站页面发送到哔知 Desktop。

## 功能

- 获取当前视频 BV、标题、UP、URL
- 读取 B 站必要 Cookie：`SESSDATA`、`bili_jct`、`DedeUserID`、`buvid3`
- 检测登录态（以 `SESSDATA` 是否存在为基础）
- 检测哔知 Desktop Bridge：`http://127.0.0.1:31420/api/browser/health`
- 一键发送到 Desktop：`POST /api/browser/import`

## 设计边界

扩展只做浏览器侧伴侣：

```text
当前页 + Cookie + 用户点击
↓
哔知 Desktop
```

不做 AI、不生成笔记、不批量抓取收藏夹。

## 本地安装

1. 打开 Chrome：`chrome://extensions/`
2. 开启 Developer mode
3. Load unpacked
4. 选择本目录：`BiliKnowledgeCompanion/`
5. 启动哔知 Desktop
6. 打开 B 站视频页，点击扩展图标发送

## Desktop Bridge

哔知 Desktop 启动时监听：

```text
127.0.0.1:31420
```

接口：

```text
GET  /api/browser/health
POST /api/browser/import
```

Bridge 仅绑定本机回环地址，不对局域网暴露。

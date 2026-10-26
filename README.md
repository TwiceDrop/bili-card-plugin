# bili-card-plugin

一个给 **TRSS-Yunzai v3** 使用的 Bilibili 视频与动态解析插件。识别群聊或私聊里的 B23 短链、视频链接、BV/AV 号、Opus 和旧版动态链接，生成竖版高清卡片。

## 功能

- 默认生成 **1080px 宽 PNG**，避免 JPEG 文字糊边
- 顶部显示视频 UP 主头像、昵称、视频发布时间和可扫码二维码
- 中间原样显示视频封面，并叠加时长、播放/弹幕/点赞
- 不在封面上创建、重绘或覆盖任何标题文字，避免与原封面标题重叠
- 底部显示原始标题、简介、UP 主和 BV 号
- 支持 B23 短链、完整视频链接、纯 BV/AV 号
- 支持 `bilibili.com/opus/`、`t.bilibili.com/`、`m.bilibili.com/dynamic/` 及其 B23 短链
- 动态卡片显示 UP 主、发布时间、正文、1～9 张图片、转发内容、附加预约/抽奖卡片与互动统计
- 动态采用紫粉渐变长图 UI，复用标题和正文字体设置
- 提供动态/开播推送 UI 服务，可供 `bili-dynamic-push` 与 `live_alert` 定时任务直接调用
- 视频和动态请求均自动读取 `TwiceDrop/bili-dynamic-push` 已配置的登录 Cookie
- 视频接口出现 HTTP 412 等临时错误时尝试从原视频网页读取资料，并校验 BV/AV 一致性
- 标题字体、正文字体可分别替换，修改后无需重启
- 主人命令和锅巴面板均可配置
- 封面与头像先下载为 Data URL 后再渲染，减少 B站防盗链导致的空图
- 重复解析冷却、请求超时、错误提示和渲染失败降级

## 安装

把整个目录放到 TRSS-Yunzai：

```text
TRSS-Yunzai/plugins/bili-card-plugin
```

然后在 TRSS-Yunzai 根目录运行：

```bash
pnpm install --filter=bili-card-plugin
```

重启机器人：

```bash
pnpm restart
```

插件依赖 TRSS-Yunzai 已配置好的 Chromium/Puppeteer 图片渲染器。

## 使用

直接发送任一种内容：

```text
https://b23.tv/xxxxxx
https://www.bilibili.com/video/BVxxxxxxxxxx
BVxxxxxxxxxx
av123456
https://www.bilibili.com/opus/1138686642968592392
https://t.bilibili.com/1134962906338689047
```

## 自定义字体

1. 把你有权使用的字体复制到：

   ```text
   plugins/bili-card-plugin/resources/fonts/
   ```

2. 发送主人命令：

   ```text
   #B站卡片字体 MyFont.ttf
   ```

支持 `.ttf`、`.otf`、`.woff`、`.woff2`。文件名可以是中文，也可以分别设置：

```text
#B站卡片标题字体 标题字体.otf
#B站卡片正文字体 正文字体.woff2
```

“标题字体”只作用于卡片顶部的 UP 主昵称和底部的视频标题。B站封面里的标题已经是封面图片的一部分，插件会保持原样，不会改字体或再覆盖一层。

恢复系统字体：

```text
#B站卡片字体 默认
```

插件不附带第三方字体文件，请自行确认字体授权。

## 主人命令

```text
#B站卡片设置
#B站卡片字体 [文件名/默认]
#B站卡片标题字体 [文件名/默认]
#B站卡片正文字体 [文件名/默认]
#B站卡片清晰度 1080
#B站卡片高清
#B站卡片开关
#B站动态卡片开关
```

清晰度支持 720～1600，默认 1080。过高的 PNG 会增加发送流量和群聊客户端压缩概率，通常 1080 最均衡。

## 手动配置

配置文件位于 `config/config.json`。常用字段：

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| `enabled` | 是否解析链接 | `true` |
| `dynamicEnabled` | 是否解析动态链接 | `true` |
| `cardWidth` | PNG 输出宽度 | `1080` |
| `titleFontFile` | 标题字体文件 | 空 |
| `bodyFontFile` | 正文字体文件 | 空 |
| `titleFontWeight` | 标题字重 | `900` |
| `bodyFontWeight` | 正文字重 | `600` |
| `descriptionMaxLength` | 简介最大字数 | `100` |
| `dynamicContentMaxLength` | 动态正文最大字数 | `5000` |
| `dynamicImageLimit` | 动态图片上限 | `9` |
| `cooldownSeconds` | 同会话同视频重复解析冷却 | `8` |
| `requestTimeoutMs` | B站请求超时 | `15000` |

## 常见问题

**字体设置成功但没有变化**

确认文件真的位于 `resources/fonts`，扩展名正确，并且字体本身包含中文字符。发送 `#B站卡片设置` 可查看插件实际识别到的文件。

**提示 Chromium 或渲染失败**

先确认 TRSS-Yunzai 自带的图片命令能正常工作，再检查 `config/config/renderer.yaml` 和 Chromium 路径。

**B23 偶尔解析失败**

短链可能失效或 B站接口触发风控。插件只跟随 `b23.tv` 到 B站视频或动态页面；失效短链会明确提示，不会误报成“不是视频”。

**如何复用 bili-dynamic-push 的登录 Cookie**

保持 `bili-dynamic-push` 已安装，并先通过它的主人命令登录：

```text
#动态推送cookie设置 SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx
```

本插件会在每次视频或动态请求前只读 `data/bili-dynamic-push/config.json` 里的 `biliCookie`，无需重复保存。Cookie 只会发给 B站，不会写入卡片、日志或错误消息。请通过主人私聊配置 Cookie；发送 `#B站卡片设置` 可查看是否成功读取（只显示状态，不显示 Cookie 内容）。

**视频接口出现 HTTP 412**

HTTP 412 表示请求被服务端限制，更新至 1.2.2 后，视频详情接口会使用共享登录 Cookie；接口仍受限时，插件会尝试读取该视频网页的 `videoData`，并校验视频 ID、标题、封面和 UP 主资料。视频已删除、审核中或仅 UP 主可见等明确错误会直接提示。如果接口和网页都不可访问，仍需等待风控解除，或检查共享 Cookie 是否有效。

## 推送插件联动

`lib/push.js` 对外提供 `renderDynamicCardForPush` 和 `renderLiveCardForPush`。定时任务没有消息事件时，服务会自行初始化 TRSS-Yunzai 渲染器；两种推送与手动解析使用同一份 UI 模板、清晰度和自定义字体设置。

## 目录结构

```text
bili-card-plugin/
├─ apps/BiliCard.js
├─ config/config.json
├─ lib/
├─ resources/
│  ├─ bilibili/card.html
│  ├─ bilibili/dynamic.html
│  ├─ bilibili/live.html
│  └─ fonts/
├─ guoba.support.js
├─ index.js
└─ package.json
```

## 许可

代码使用 MIT License。Bilibili 视频信息、封面、头像及用户自行安装的字体分别受其原始权利人条款约束。

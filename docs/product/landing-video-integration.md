# 落地页与定稿视频整合（2026-10-19）

## 页面叙事

定位 → 定稿影片 → 推荐成果示例 → 首次任务 → 长期上下文 → 控制权、价格与 FAQ。
首屏统一为 “Your Personal Agent. Built for headhunters.”，以 “With you for the long term” 补足长期定位。
移除重复的模拟聊天、三场景 tabs 和长时间线。保留试用、登录、套餐及流量归因链路。

推荐示例沿用影片中的虚构 Mira / Northstar，正文可以原位展开，包含依据、事实边界、下一次沟通问题、简历节选及反馈机制说明。明确标注 illustrative content；它是编辑制作的营销示例，不是实时 Agent 产物，也不连接真实客户记录或收集反馈。首次任务从一份 JD 和两三份简历开始，不承诺固定数量的任务可在试用额度内完成。

## 视频资产与复现

母版：相邻 `hirelix-video` 项目 `output/v3.3/hirelix-built-for-headhunters-v3.3.mp4`，用户已定稿。
母版 SHA256：`ced70f0e1801df4c06642ce4981b77e8dd4e8afbbfd6ed101c0ccc85d884c3a3`。
派生文件：`public/landing/video/hirelix-headhunters-v3.3.mp4`；封面同名 `.jpg`。

```bash
ffmpeg -i MASTER.mp4 -vf fps=30 -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -c:a copy -movflags +faststart hirelix-headhunters-v3.3.mp4
ffmpeg -ss 21.6 -i MASTER.mp4 -frames:v 1 -q:v 2 hirelix-headhunters-v3.3.jpg
```

网页版本约 4.1 MiB、1080p / 30 fps、936 帧、31.2 秒；音轨直接复制，不重混音或裁切。封面提取自 21.6 秒，约 95 KiB。网页默认只加载封面，点击才开始有声播放，随后显示原生控制条，支持拖动、全屏和重播。播放失败显示直接打开文件入口；另有可展开文字故事。没有自动播放或循环背景。

音频解码 SHA256（母版和网页版相同）：`e5aeb70a5f92726defc78d1a93aeff79dd10d58d424de2cdbe430cdf6f85f375`。

## 验证范围

- 本地 Chrome 页面、桌面完整截图及 360 / 390 / 768 / 1440 宽度布局检查；浏览器无 pageerror。
- `e2e/landing.spec.ts`：7 项通过，含播放、暂停/seek、结束/重播、英文页面、示例键盘展开、FAQ、带归因的真实登录入口。
- `e2e/seo.spec.ts`：7 项直接通过；首次任务文案和反馈指南链接更新后，剩余 1 项定向复跑通过。覆盖公开页与结构化数据、无 JS 内容、私有页面边界、指南与套餐入口。
- `npm run build`、`npx tsc --noEmit`、改动文件 ESLint、`git diff --check` 通过。
- ffprobe 确认视频和音频均 31.2 秒；FFmpeg 完整解码无报错，解码音频 hash 与母版相同。

仅本地落地页验收；没有重新执行付费 AI 任务、发信、生产部署或 Google OAuth 完整登录。实际产品生成推荐材料的能力验收不由本营销示例代替。

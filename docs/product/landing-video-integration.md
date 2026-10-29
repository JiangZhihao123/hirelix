# 落地页与定稿视频整合（2026-10-19）

## 页面叙事

定位 → 定稿影片 → 推荐成果示例 → 首次任务 → 长期上下文 → 控制权、价格与 FAQ。
首屏统一为 “Your Personal Agent. Built for headhunters.”，以 “With you for the long term” 补足长期定位。
移除重复的模拟聊天、三场景 tabs 和长时间线。保留试用、登录、套餐及流量归因链路。

推荐示例使用虚构 Mira / Northstar（出自旧版 v3.3 影片），正文可以原位展开，包含依据、事实边界、下一次沟通问题、简历节选及反馈机制说明。明确标注 illustrative content；它是编辑制作的营销示例，不是实时 Agent 产物，也不连接真实客户记录或收集反馈。首次任务从一份 JD 和两三份简历开始，不承诺固定数量的任务可在试用额度内完成。

## 视频资产与复现

2026-10-29 起 Hero 播放器改用 35 秒发布片。源工程：`video/hirelix-launch/`（Remotion，渲染与网页转码命令见其 `README.md`）；`out/` 不入库。
母版 `out/hirelix-launch-master.mp4` SHA256：`fdef671b150ec7769fe062337a669a5906eed51a56da33982e2daa385deafb2d`。
派生文件（`public/landing/video/`）：

- `hirelix-launch-web.mp4`：H.264 + AAC，1080p / 30 fps，1050 帧，35.0 秒，约 4.8 MiB，`+faststart`。
- `hirelix-launch-web.webm`：VP9 + Opus，约 6.1 MiB，作为第二个 `<source>`。
- `hirelix-launch-cover.png`：第 1020 帧品牌收尾画面，约 74 KiB，用作 poster。

旧 v3.3（31 秒 Mira / Northstar 版）视频和封面已从 `public/` 删除；下方推荐成果示例仍沿用 Mira / Northstar，与影片故事不再一一对应。

两份网页编码已把色彩标记从母版的 sRGB 传输（`iec61966-2-1`）改为 BT.709（`-c copy` 重封装，解码画面 MD5 不变）；未改标记前 Chrome 156 加载到 metadata 后不再前进。

网页默认只加载封面（`preload="none"`），点击才开始有声播放，随后显示原生控制条，支持拖动、全屏和重播。MP4 在前，浏览器都无法播放时显示直接打开 MP4 的入口；“Read the story”文字稿已按新片内容改写。没有自动播放或循环背景。

## 验证范围

- 本地 Chrome 页面、桌面完整截图及 360 / 390 / 768 / 1440 宽度布局检查；浏览器无 pageerror。
- `e2e/landing.spec.ts`：7 项通过，含播放、暂停/seek、结束/重播、英文页面、示例键盘展开、FAQ、带归因的真实登录入口。
- `e2e/seo.spec.ts`：7 项直接通过；首次任务文案和反馈指南链接更新后，剩余 1 项定向复跑通过。覆盖公开页与结构化数据、无 JS 内容、私有页面边界、指南与套餐入口。
- `npm run build`、`npx tsc --noEmit`、改动文件 ESLint、`git diff --check` 通过。
- ffprobe 确认视频和音频均 31.2 秒；FFmpeg 完整解码无报错，解码音频 hash 与母版相同。

仅本地落地页验收；没有重新执行付费 AI 任务、发信、生产部署或 Google OAuth 完整登录。实际产品生成推荐材料的能力验收不由本营销示例代替。

### 35 秒发布片接入验证（2026-10-29）

- 本地 Chrome（应用内浏览器，1440 宽）：首屏只请求封面；点击后有声播放 MP4，时长 35.008 秒，原生控制条出现，seek 到 21 秒、跳至 34.7 秒播放到结束、再次点击从头重播均正常，无错误提示。WebM 单独加载可播放。
- `e2e/landing.spec.ts`（`PLAYWRIGHT_CHANNEL=chrome`，chromium + mobile-chrome）：16/18 通过。失败的 2 项都是影片测试的“有声播放”步骤：本机 Playwright 驱动的 Chrome 和自带 Chromium 145 无法有声播放任何视频，旧 v3.3 文件同样卡住；只给该测试注入静音后，两项用例对新文件全部通过。属于本机测试环境限制，未在 CI 或其他机器复核。
- `npx tsc --noEmit`、改动文件 ESLint 通过。未执行 `npm run build` 和生产部署。

## 三处局部优化（2026-10-19）

保留居中首屏、视频位置及主次层级。首屏辅助文字改为 `7-day free trial · No card required`，credits 继续在首次任务和价格区说明。展开的推荐示例补齐虚构职位简报、重新联系原因、角色相关判断、建议动作、完整样例简历（经历、教育、能力）和客户反馈/跟进示例；注明编辑制作的虚构内容，不声称真实 Agent 生成。简历与 September notes 来源分开，不把待核实事项改成已确认事实。

价格区默认保留税费、试用不自动付费和付费续订条件；额度计算、月度重置、余额不结转及访问结束规则移入原生 details，支持键盘展开，保留退款政策链接。

验证：Chrome 人工检查展开内容与价格规则；landing + SEO 共 16 项通过，TypeScript、改动文件 ESLint、diff whitespace 检查通过。无生产部署或业务后台变更。

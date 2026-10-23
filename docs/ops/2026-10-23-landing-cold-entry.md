# 首页冷加载入口修复与验证

日期：2026-10-23。生产观察基线：`527435552c5074d16c4b4cc41f9c4b7861f22071`。

## 根因与影响

第一次生产 Playwright 启动缺少 `chromium_headless_shell-1208`，属于本机测试环境问题。后续使用已安装 Chrome 的运行则暴露产品入口问题：首页用 `useSyncExternalStore` 的服务端快照 `false`，在 hydration 前给登录和六个试用入口输出 `disabled` 按钮。因此用户已经看到页面时，入口仍需等待全部关键 JavaScript 下载和执行。

保留的失败 trace 中，首页 HTTP 200 总耗时 2.512 秒，CSS 9.605–11.831 秒，11 个 JS 14.448–19.235 秒，均为 200。认证 `get-session` 在 JS 完成后才发出，未发现它阻塞按钮启用；视频为 `preload="none"`，首屏未请求 MP4。不能把缺少浏览器二进制或测试的 5 秒断言超时当作全部根因。

生产同一 URL 的新观察如下。Chrome 每组均使用新的隔离 context；warm 为同 context 的第二次导航，未清除用户浏览器缓存或会话。

| 表面 | HTML TTFB | CTA 首次进入 DOM | CTA 启用 / hydration |
| --- | ---: | ---: | ---: |
| 本机独立 Chrome，默认网络，cold | 1.288 s | 3.433 s | 6.972 s |
| 同 context，warm | 0.194 s | 0.217 s | 0.233 s |
| 本机独立 Chrome，显式本机代理，cold | 1.183 s | 1.223 s | 2.758 s |
| 同代理 context，warm | 0.192 s | 0.204 s | 0.225 s |

美西 `us-2` 只读 HTTP：首页 TTFB 0.115 秒、总计 0.127 秒；失败 trace 中最后完成的同一 JS，TTFB 0.063 秒、总计 0.063 秒。本机同 JS 的一次直连总计 1.328 秒、显式代理总计 1.519 秒。结果支持本机网络路径影响延迟，不能据此推断所有北美用户的加载时间，也未证明网络波动已消除。此前中断的完整生产浏览器 suite 不记为通过。

## 修复

- 首页 `page.tsx` 作为小型服务端包装，仅取归因 query 白名单，将当前页面 UI 放到 `LandingPage` 客户端组件。
- 登录和六个试用入口输出原生 `a href`。服务端 href 保留 UTM、gclid/ref、entry、首个任务 prompt；月/年入口分别包含原 plan。目标固定为 `/app`，不接收外部重定向参数。
- hydration 后继续使用现有 analytics 获取当前/已保存归因，并更新本次点击的 href；保留浏览器默认导航、修饰键、新标签和链接语义。现有归因函数没有从同源 referrer 回收 landing UTM，因此使用服务端 query 透传。
- 两个视频播放按钮仍等待其 JavaScript handler。修复不宣称整个应用无需 JavaScript，也没有修改超时阈值或静态资源网络路径。

## 本地真实浏览器验证

验证 worktree 独立位于生产基线，使用隔离库 `hirelix_workspace_qa_local_20261022` 和 `next start`。没有执行 LLM 任务、生产部署或生产重启。

1. `npm run build -- --webpack`、`npx tsc --noEmit`、相关文件 ESLint 和 `git diff --check` 通过。
2. 原 `e2e/landing.spec.ts`、`e2e/seo.spec.ts` 的 16 项用例，加一项无 JavaScript 入口回归，共 **17 passed (11.1s)**。真实 Chrome，2 workers，retries 0；没有调高默认断言超时。包括视频真实播放/seek、公开推荐展开、语言、归因、登录页和 SEO 边界。
3. 新增无 JavaScript 用例检查七个 href、两种 plan 和 campaign，并真实点击 hero 到 `/app`。该检查证明浏览器原生导航，不代表应用登录/执行可在关闭 JavaScript 时工作。
4. 独立浏览器补测主动暂缓首页 11 个 JS：124 ms 观察时视频按钮仍 disabled，hero 已有完整 href；点击后保留 campaign/gclid/entry/prompt，在 701 ms 内到真实 `/app` 登录页。该项属于受控延迟条件，不作为真实网络性能数字。
5. hydration 后使用 Mac Command 点击 hero：新标签到真实登录页、campaign 保留，原标签留在首页。
6. 用户现有 Chrome 登录态：本地首页 hero → `/app` 已登录 AI assistant，campaign 与首个任务草稿保留，未发送任务。
7. 修复后本地自然 cold：TTFB 28.6 ms，CTA 首次进入 DOM 与可用均 39.6 ms，hydration 141.7 ms。此本地数字不能与生产网络时间计算加速比例。

本次测试命令：

```bash
PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://localhost:3000 PLAYWRIGHT_REUSE_SERVER=1 npx playwright test e2e/landing.spec.ts e2e/seo.spec.ts --project=chromium --workers=2 --reporter=line --retries=0
```

## 缓存代价与发布后检查

首页由静态预渲染改为按 query 请求渲染；没有增加数据库查询。原生产响应为 `x-vercel-cache: HIT` / `x-nextjs-prerender: 1`。本地固定构建响应为 `private, no-cache, no-store, max-age=0, must-revalidate`。

同机、同 webpack 生产构建，旧基线端口 3006 与修复版端口 3000 交替请求，去掉每组首个样本后各 11 次：旧静态服务端 TTFB 中位数 2.591 ms，新动态 4.450 ms，增加 1.859 ms。静态范围 1.942–4.741 ms，动态范围 3.756–9.329 ms。仅量化本机暖服务端成本，**尚未量化失去 Vercel CDN 缓存和冷函数的生产成本**。

发布后应再次跑同一 suite、隔离 Chrome cold/warm，读回首页缓存头、TTFB、CTA href/可用与 hydration 时间，并用生产现有登录态验证入口。修复使导航不再等待首页 hydration；它不修复网络路径，也不替代生产首访及整个发布链路验收。

## 证据位置

原失败、网络提取、Chrome cold/warm JSON、HTTP/缓存计时、受控延迟检查与截图保存在主工作目录 `tmp/cold-load-root-cause-20261023/`；构建、类型检查、E2E 日志在本修复 worktree 同名 `tmp/` 目录。证据不纳入 Git，避免提交运行数据。

受控延迟补测第一次在截图阶段等待 fonts 超过 Playwright 的 30 秒截图超时，未达到点击步骤，保留为 `fixed-browser-verification-first.log`，不记为通过。随后以 CDP 捕获当下画面，不等待字体就绪，再独立完成原生点击和最终登录页断言；产品逻辑和断言超时未改。

# 网站访问与注册获客归因

本次是本地实现，未推送、合并、部署或操作生产数据库。基线：主仓库 `/Users/noah/projects/hirelix`，`main` / `d96b4f25`，初始工作区干净；实现位于独立 worktree。已阅读根 `AGENTS.md`，本仓库没有 `.agents/skills`。复用既有 `hirelix_growth_landing_events`、better-auth 和 `/admin`，没有新服务、依赖或数据库表。

## 修复的缺口

既有浏览器采集、UTM 校验、第一方持久化及管理员统计都已经存在。旧活动表只按 source/medium/campaign 分组，丢失 content 维度；“关联账号”也不是新注册。UTM 原先仅保存在标签页，且在每次读取时可能被站内 URL 参数覆盖。客户端 OTP 成功和 Google 回跳的近十分钟估算也会把重复登录当注册信号。

现在活动表按 source/medium/campaign/content 展示浏览器访客、访问会话、PV 和实际新注册账号，并可筛选 campaign/content。注册事件只由 better-auth `user.create.after` 产生服务端标记；普通浏览器不能提交该标记。注册指标再关联真实 user 记录并按账号去重，重复登录、刷新及重复客户端事件不增加注册数。

## 来源策略

- 首次来源：本浏览器当前获客周期第一次观察到的来源，包含 direct。
- 最近来源：最后一个有效 UTM 或外部 referrer 入口。新来源整组替换，缺少 content 时不沿用上次的 content；direct 回访不覆盖已知来源。
- 仅在文档入口解析一次；站内路由、站内携带 UTM 的链接、刷新不覆盖来源。首次来源超过 90 天后开始新周期；清理浏览器存储也会重置。共享浏览器不能当作独立真人，未建立跨设备匿名身份图。
- localStorage 保存 first/latest；sessionStorage 保留既有回跳上下文；SameSite=Lax、同源 Path=/ 的第一方 cookie 只携带随机 visitor/session ID、获客标签和时间，用于 OAuth/OTP 建号钩子。HTTPS 下启用 Secure。没有邮箱、正文、简历、完整查询串、指纹或第三方追踪。
- 认证请求前同步 cookie：读取其他标签页更新的最近来源，同时使用实际发起登录的标签页 session ID，避免共享 cookie 把注册错误关联到别的标签页会话。
- 新增的标签只接受最长 120 字符的字母、数字、下划线、点、波浪线和连字符；邮箱和 URL 不能成为活动标签。cookie 不包含 gclid 或 utm_term。
- 缺少可用归因 cookie 的真实新注册记录为 unattributed，不能假定 direct。缺少首次快照的历史事件在“首次来源”口径下也是 unattributed；不补造历史归因。
- 注册时的来源快照保持不变，后续新来源不会重写已注册账号的获客归属。报表按注册发生的筛选窗口统计该注册群组截至窗口末的后续行为。

## 查看入口和指标边界

上线后进入 `https://hirelix.online/admin`，使用已有独立管理员登录，打开“来源与页面”→“推广活动 UTM”。选择时间范围，来源填 `targeted_email`，活动填 `na_recruiters_w1`，内容填 `all` 查看三封分组，或选择已核验的 `hello_recruit`、`cmf_search`、`acquaint_new_york`。媒介均为 `email`。默认使用最近非直接来源，可切换首次来源，点击“应用筛选”。这三个标签来自已发信台账核验；测试不用这些标签。

API 仍为受管理员会话保护的 `/api/ops/analytics`，新增参数 `campaign`、`content`、`attribution=latest|first`。导出沿用当前已应用的范围，包含统计口径。不得公开后台或将完整用户明细写进报告。

访问数是网站采集结果，不能称为已验证的邮件真人点击，也不能推断已读或送达。沿用入口的已知 bot/自动化/私网/云流量过滤，不能保证识别所有邮件安全扫描器、预加载或机器人。默认排除本地事件和配置的内部账号；自测使用 QA 活动标签、隔离本地库，不能当客户成果。没有新增邮件像素。

“完成业务任务账号”来自已完成的 import/assessment/deliverable/revision/brief_proposal/retrieval 记录，排除普通聊天和后台 index；它证明已有任务记录完成，不能证明招聘质量或客户认可。“再次使用账号”为注册后至少 24 小时再次发送用户消息，没有完整观察窗口时可能仍为零，不能当成熟留存率。“完成交易回调账号”来自 `transaction.completed`，包含 Sandbox；不能宣称 Live 付费客户数或实收营收。原有产品、回访和账单视图保留。

## 验证与上线

本地可复现命令（DATABASE_URL 必须是 loopback QA/test 库，网站与测试使用同一个库）：

```sh
node --import tsx --test tests/growth-attribution.test.ts tests/analytics.test.ts tests/telemetry.test.ts tests/growth-landing-event.test.ts tests/growth-traffic.test.ts tests/client-auth-telemetry.test.ts
node --env-file=.env.qa --import tsx scripts/qa/verify-acquisition.ts
npx tsc --noEmit
npm run lint
```

`verify-acquisition.ts` 使用真实 Chrome、采集 API、better-auth OTP 注册 API、PostgreSQL 和受保护报表。OTP 仅预置在独立 QA 库，不发送外部邮件。验证落地→路由→站内 UTM→刷新→注册→重复登录→新标签页/direct 回访→第二来源→首次/最近报表，以及无 UTM 新浏览器注册、字段脱敏、客户端伪造标记拒绝和默认排除本地流量。后续任务、24h 回访及交易回调是专门标记的聚合 fixtures，未真正执行 Agent、付费或等待一天；测试结束清理全部 fixtures。Google OAuth 和邮件实际投递未在本轮重跑。

验收输出 `output/acquisition/evidence.json` 和 `output/acquisition/campaign-report.png` 只含本地 QA 数据。当前工作区 `.env.qa` 为忽略文件，不得提交或部署。没有补造历史生产流量。

上线最小步骤：审阅并授权本地提交的整组网站变更，再按既有流程发布 Web。不需要新密钥、OAuth 或新表迁移；复用已有事件表和管理员配置。部署后用内部 QA 标识与已排除的测试账号确认采集和报表回读，再以 `na_recruiters_w1` 的真实数据查看结果。本次尚未执行该生产步骤。

本次实际结果：全量单测 501 通过、19 跳过、0 失败；跳过项为依赖额外 PG/场景开关的既有测试，不能视为通过。登录前跨标签页同步修复后定向 25 项通过。获客 Chrome+HTTP+DB 脚本、已有分析 SQL/HTTP 脚本均通过；TypeScript、ESLint、`NEXT_DIST_DIR=output/acquisition-build npm run build` 通过。初次启动遇到 tsx CLI IPC 沙箱限制、Next CLI 转发 `--env-file`、worktree 依赖符号链接及旧 QA schema 缺表，分别通过 Node import 启动、dotenv 启动、worktree 内本地依赖副本和仅本地应用已有迁移解决；后续聚合 fixture 的时间参数问题也已修正并重跑通过。

证据中的 QA 数字只验证口径：同一个测试浏览器先访问 `qa_alpha` 再访问 `qa_beta`、分别新建测试账号，最近来源下各 1 个注册，首次来源下 `qa_alpha` 为 2；新浏览器无 UTM 注册为 direct 1。独立 outcome fixture 的任务/回访/回调各为 1。均不是客户流量、业务任务实跑或真实付费。

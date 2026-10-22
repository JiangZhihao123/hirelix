# 三条产品流程的横向回归

## 当前范围

应用基线 `25d0d401`，本轮仅修改落地页回归断言及记录。三条流程完整目标保持不变；当前代码未推送、未部署，本地可用性不等于商业转化或生产放行。

| 产品流程 | 本地已有完整链路 | 本轮交叉检查 |
| --- | --- | --- |
| 落地页吸引试用 | 北美定位、明确委托与成果、试用条件、主 CTA 到可编辑请求 | Chrome 实际核对 7 天/200 额度/免卡、展开计费细节、主 CTA 同时保留来源参数和首次委托 |
| 试用获得购买价值 | JD/PDF/DOCX → 保存、比较、推荐 → 原 CV 与正文下载 → 查看方案并返回 | 生产构建包含当前所有入口和成果页面；现有真实文件、草稿保护、方案选择证据继续保留，不将编译替代业务链路 |
| 持续使用与续费价值 | 新对话找回资料、电话事实续改、更新职位评估、原稿版本、提醒、普通登录续接 | 当前完整应用隔离构建通过，QA 环境元数据核对通过；原 worker 进程仍存在，未借构建重启服务 |

具体业务链路及其对象、截图、文件哈希与边界见[产品流程证据索引](../product/three-product-journeys.md)。本轮没有重复发送业务委托、外发、发布或付款。

## 隔离生产构建

使用现有 NEXT_DIST_DIR 支持，在 `.next-agent-qa` 执行 `npm run build`；显式注入同一隔离 QA 数据库，未编辑 .env.local。构建不占用正在运行的开发目录。

Next.js 16.2.10 / Turbopack 编译通过（14.4 秒），构建内 TypeScript 检查通过，67 个静态页面生成通过，退出码 0。tsconfig 没有被改动。日志 `tmp/mainflow-build.log`，不提交构建产物。该结果证明可构建，未将其宣传成生产部署或完整业务验收。

## 回归断言修正

`e2e/landing.spec.ts` 仍要求首屏“不包含 credits”及旧试用文案，与当前公开展示试用额度的设计相反。改为根据 AGENT_PLAN 核对天数、额度和免卡说明；主 CTA 用既有 firstAssignmentPrompt 核对委托衔接。未删除试用条件或来源归因检查。

Chrome Computer Use 实际打开带 `utm_source=landing-qa&utm_campaign=personal-agent` 的首页，核对说明、展开/收起计费规则，再点击主 CTA：工作区 URL 保留两项来源、entry=free_trial 及首次委托，输入框可编辑且没有自动发送。

TypeScript、lint、git diff --check 通过。Playwright `--list --project=chromium` 能发现该文件 8 项测试，未启动浏览器或宣称整套 E2E 已执行；本轮浏览器验证按用户要求使用本机 Chrome Computer Use。其余视频、匿名登录、手机断点等完整 spec 未重跑。应用最近全量单测为 507 项（492 通过、15 门控跳过），本轮应用逻辑未再变动，没有以重复跑单测替代真实浏览器检查。

## 测试环境缺口

只读 `check:workspace --database --worker` 首次发现本地 QA 缺少 `hirelix_admin_sessions`、`hirelix_admin_login_limits`。已核对并仅应用仓库现有 `20261019_admin_login.sql`：两项 CREATE TABLE IF NOT EXISTS 和一项索引，无招聘资料更新。未重启、清空或重建数据库。

事务内前后计数均为 people=9、roles=5、documents=5、records=40、files=16。再次检查配置就绪、必需表/权限/扩展就绪。报告明确不验证 provider 凭据或 worker 活性；另由系统进程表确认原开发父进程 61649、worker watch 61650 存在，不能仅凭进程存在推断所有任务成功。

本轮没有操作管理登录或创建管理员会话。元数据日志 `tmp/mainflow-runtime-check.log`、迁移核对 `tmp/mainflow-qa-schema-check.json`。没有触及生产数据库、原有提醒或 Owen 待定选择。

## 未证明的范围

当前累计改动尚未部署后的生产链路、真实新用户登录、付款与 webhook、长期续费效果，均不能由上述本地检查推断。本轮没有发现新的已复现招聘主流程阻断，但这不等于整站或商业目标已完成。

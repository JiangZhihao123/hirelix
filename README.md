# Hirelix

AI 驱动的被动候选人搜索平台：输入职位描述（JD），自动在 LinkedIn/GitHub 中找到匹配候选人并生成外联文案。

## 架构概览

```
                    ┌──────────────┐
                    │   用户浏览器  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │    Vercel     │  Next.js 前端 + API Routes
                    │  (无状态)     │  30s 超时限制
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │                         │
       ┌──────▼───────┐         ┌──────▼───────┐
       │ us-2 Postgres │         │   us-2 VPS   │
       │ 业务 + Auth DB │         │   调度器      │  处理长耗时搜索任务
       │ better-auth表 │◄────────│   独立进程    │
       └──────────────┘         └──────────────┘
```

**搜索流水线**（VPS 调度器中运行）：
1. JD 解析 → 提取技能、职位、目标公司、召回策略
2. Bright Data Dataset → 按条件召回 LinkedIn 档案
3. AI 深度评分 → 多维评分（匹配度/能力/加入意愿）
4. GitHub 富化 → 异步排队，独立 worker 处理
5. 外联文案生成 → 基于候选人档案生成个性化文案

## 目录结构

```
src/
  app/                        # Next.js App Router
    (landing)/                # 营销落地页
    (marketing)/              # 法律/隐私/条款页面
    (product)/                # 产品页面（需认证）
      api/                    # 产品 API 路由
      app/                    # 产品 UI 页面
    api/                      # 共享 API（Paddle webhook、内部调度）
    auth/                     # 认证回调
  components/                 # 共享 React 组件
  lib/                        # 业务逻辑与工具库
scheduler/                    # VPS 调度器入口（独立部署）
scripts/                      # 开发/调试脚本
  debug/                      #   诊断脚本
  integration/                #   外部 API 集成测试
  pipeline/                   #   流水线测试/度量
  tools/                      #   工具脚本
tests/                        # 单元测试
e2e/                          # Playwright E2E 测试
supabase/                     # 数据库迁移与 schema
docs/                         # 项目文档（策略/架构/增长/营销）
```

## 快速开始

### 环境要求

- Node.js 20+
- npm

### 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 API key 和数据库凭据

# 3. 启动开发服务器
npm run dev
# 访问 http://localhost:3000

# 4. （可选）启动调度器（另起终端）
npm run scheduler:dev
```

### 网络代理

中国大陆本地开发通常需要代理访问 Google OAuth 和外部服务：

```bash
# 在 .env 中配置
PROXY_ENABLED=true
PROXY_URL=http://127.0.0.1:7890
```

> 生产环境不需要代理，不要把代理配置带到生产环境。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Next.js 开发服务器 |
| `npm run scheduler:dev` | 启动本地调度器 |
| `npm run build` | 生产构建 |
| `npm run lint` | ESLint 检查 |
| `npm run test:unit` | 单元测试 |
| `npm run test:e2e` | E2E 测试（headless） |
| `npm run test:e2e:ui` | E2E 测试（UI 模式） |

运行单个测试文件：

```bash
npx tsx --test tests/github-signals.test.ts
```

## 环境变量

完整的环境变量列表及默认值参见 [`.env.example`](.env.example)。

核心变量分组：

| 分组 | 变量 | 说明 |
|------|------|------|
| 数据库 | `DATABASE_URL` | us-2 自托管 PostgreSQL 连接字符串 |
| Auth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | better-auth + Google OAuth |
| 内部 API | `INTERNAL_API_SECRET` | 调度器触发内部 runner 的 Bearer secret |
| AI | `AI_PROVIDER`, `AI_MODEL`, `DEEPSEEK_API_KEY` | AI 模型配置（默认 DeepSeek） |
| 数据源 | `BRIGHTDATA_API_TOKEN` | LinkedIn 数据召回 |
| GitHub | `GITHUB_TOKEN`, `SERPER_API_KEY`（可选） | GitHub 富化（Serper 仅用于身份发现兜底） |
| 计费 | `NEXT_PUBLIC_PADDLE_*`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET` | Paddle 支付、webhook 与 customer portal |
| 通知 | `RESEND_API_KEY`, `SEARCH_NOTIFICATIONS_ENABLED` | 搜索完成邮件通知 |

## 部署

| 组件 | 部署位置 | 说明 |
|------|----------|------|
| Next.js 前端 + API | Vercel | push 到 main 自动部署 |
| 搜索调度器 | us-2 VPS `/opt/hirelix` | GitHub Actions CI/CD 自动部署 |
| 数据库 | us-2 PostgreSQL | 自托管业务表与 better-auth 表 |

生产域名：`hirelix.online`

调度器部署详情参见 [AGENTS.md](AGENTS.md#调度器部署)。

## 文档

详细文档位于 [`docs/`](./docs/README.md)：

- **架构**：数据流水线与处理流程
- **策略**：产品方向与增长逻辑
- **增长**：24个月计划、转化漏斗、ROI 模型
- **上线**：付费测试版清单
- **营销**：发布素材

## 编码规范

参见 [`docs/conventions.md`](./docs/conventions.md)。

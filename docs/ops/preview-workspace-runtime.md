# Preview 工作区连接与启动

Preview 构建成功只证明代码能打包。登录需要数据库和认证配置，Agent 工作还需要连接同一数据库的独立 worker、DeepSeek 和嵌入服务。Vercel 不运行 scheduler。

## 当前已核实的资源与边界

- 候选 PR8 的 Preview 只有 `OPENROUTER_API_KEY`、`AI_MODEL` 两个变量；没有读取它们的值。
- us-2 PostgreSQL 17 已监听 5432 并开启 TLS。这个事实不单独证明任意 Vercel 请求可连接，访问控制仍须由管理员确认。
- 三个旧 QA/恢复库的表统计显示非空，其中一个缺少工作区 jobs 表。没有读取里面的个人记录，也不将它们当空库复用。
- Mac 的新建隔离 QA 库可用于本机验证，但 Vercel 不能连接 Mac 的 `127.0.0.1`。不要上传本机认证会话、启用临时公网隧道或指向生产 `hirelix` 来跳过隔离。

## 最小连接方案

复用 us-2 现有 PostgreSQL 服务，新增专用空数据库（建议名 `hirelix_preview`）及仅有该库应用权限的登录角色（建议名 `hirelix_preview_app`）。只初始化经过核对的 schema，不复制生产/恢复库的行数据。启用 `vector`、`pg_trgm`，保留当前队列和额度账本结构。不要把超级用户或生产应用角色配置给 Preview。

另用独立 checkout 和独立进程运行候选的 scheduler；它与 Preview Web 使用同一专用数据库和同一候选 SHA。不要更新 `/opt/hirelix` 或复用生产 worker：生产 worker 不会消费另一个数据库中的任务。

上述数据库/角色、密钥和服务权限都是管理员需明确配置的资源。本轮仅准备诊断与说明，没有创建、复制或传输这些凭据，没有开端口或修改部署保护。

### 管理员需填写的最小配置

| 配置 | 位置与用途 |
| --- | --- |
| `DATABASE_URL` | Preview Web 和专用 worker；同一隔离库，使用 TLS 直连/会话端点和独立登录角色；实时流依赖 LISTEN/NOTIFY，不用事务池化连接。管理员确认该角色不能读生产业务表。 |
| `BETTER_AUTH_SECRET` | Web 与 worker 使用同一个**独立预览密钥**，不复用生产密钥或本机会话。 |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | Web 认证需要允许预览回调的客户端；worker 只有实际使用 Gmail 授权工具时需要相应配置。不擅自修改其他产品客户端或申请 Gmail 额外权限。 |
| `BETTER_AUTH_URL`、`NEXT_PUBLIC_APP_URL` | 都使用固定候选分支别名的 origin，不使用每个提交变化的部署 URL。 |
| `DEEPSEEK_API_KEY` | 专用 worker 的实际 Agent 执行；正式 DeepSeek 为主。不要把仅有 OpenRouter 当作主服务已配好。 |
| `SILICONFLOW_API_KEY` | 专用 worker 的候选人/JD 索引与检索；嵌入维度保持 1536。Web 侧缺少此变量不单独证明后台检索不可用。 |
| `PRIVATE_WORKSPACE_WORKER_ENABLED=true` | 仅专用 worker；确保私人工作区任务会执行。 |
| `SEARCH_JOB_SCHEDULER_ENABLED=false` | 专用预览 worker 关闭旧搜索调度循环。不会恢复已退出的外部人才寻访产品。 |

当前固定别名为：

```text
https://hirelix-git-qa-hirelix-release-2f5a5db-noahs-projects-292679b9.vercel.app
```

Google 的允许回调需精确包含该 origin 加 `/api/auth/callback/google`。测试一律从这个固定别名进入；任意部署 URL 不是另一条自动获准的 OAuth 回调。Vercel 保护保持原样，通过已有正常授权账户审阅。

邮件验证码另外需要独立获准的 Resend 配置；Gmail 发送需要用户的具体授权，Paddle 需要相应支付环境。它们都不由“Google 登录成功”推定已通过。不要为了 Preview 把这些生产秘密全部复制过去。

## 诊断和启动顺序

`npm run check:workspace` 只检查当前进程注入的配置；不自动读 `.env`、不开隧道、不打印值、不调用模型或发信。缺配置返回非零退出码，并列出变量名称。不会创建身份、任务或表。

在已由管理员安全注入环境的 checkout 中：

```bash
npm run check:workspace
npm run check:workspace -- --database
```

上述默认检查 Web 认证。在专用 worker 环境使用 `npm run check:workspace -- --worker --database`，检查数据库、会话密钥、模型/嵌入配置和 worker 禁用开关；不会为了 Web 认证要求它额外持有模型密钥，也不会把可选 Gmail 配置当作纯索引 worker 的前提。

`--database` 仅在只读事务中检查连接、必要表、表权限、扩展及队列列，连接/语句有超时；不枚举业务数据。表清单覆盖认证、上传/导入、候选人与职位关联、来源资料、对话恢复、交付物及版本、发送回执、日程、额度与计费记录共 24 张表，逐表检查 SELECT/INSERT/UPDATE/DELETE 权限。结果区分“未检查”“缺表/权限”“连接失败”，错误不会回显连接串。它不证明所有迁移完整、供应商密钥有效或 worker 存活。

`tests/integration/workspace-runtime-diagnostic.test.ts` 是新建本地合成库专用的 opt-in 测试，要求 `WORKSPACE_DIAGNOSTIC_FIXTURE` 与该库名一致。它会临时改名三张资料/关联/版本表、创建并清理 NOLOGIN 权限角色以验证反例；还会创建并清除合成账号验证正常密码登录和会话读取。不能对已有 QA 库或生产库运行。SDK 的连接失败、400/401 和成功响应另由 `tests/auth-status.test.ts` 覆盖；Google OAuth 的既有真实验收见 [2026-10-16 记录](2026-10-16-gmail-oauth-verification.md)，不把本轮合成登录当作新的 OAuth 验收。

若使用管理员维护的独立环境文件，可在该环境文件正常加载后运行上述命令。不要把密钥写入终端参数、Git、CI 日志或此文档；不要使用可能自动连生产隧道的默认 `npm run dev` 来启动预览服务。

诊断通过后，专用 checkout 中运行 `npm run scheduler:start`，核对 `private_workspace_worker` 启动日志及候选 SHA；以单个已授权的虚构任务验证任务实际结束，不能用“进程还活着”替代执行证据。正式进程托管、环境文件权限和停止策略由管理员按批准的资源配置，不修改生产 service。

## 对用户的失败行为与公开试用决策

认证配置缺失时，认证及工作区入口返回不缓存的 503 和安全的服务不可用信息；管理员日志只列缺少的变量名。登录页显示联系支持/稍后重试，不把部署错误说成密码或验证码错误，也不让用户反复尝试所有登录方式。配置完整时，原有认证校验仍生效。

托管 Preview 的登录后链路在配置完成前仍未验收。已有本地真实 Agent/UI、真实 Google/Gmail 和 Sandbox 证据继续保留，但不证明这个未配置后端的预览可用。

公开试用最终在 `hirelix.online` 运行。候选发布到现有生产环境是另一条发布决策：需明确允许 main 合并/部署，并核对 Web/worker 同 SHA、生产配置与健康。不要将“必须另建完整预览环境”擅自新增为发布硬门槛，也不要把静态 Preview Ready 等同已上线。本任务未合并 main 或更新生产。

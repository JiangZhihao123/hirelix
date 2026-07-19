# Codex 新工作树的本地运行约定

Git worktree 只隔离代码，不会自动隔离端口、环境变量或数据库。创建工作树后，在项目根目录配置 Codex 的“设置脚本”为：

```bash
bash "$CODEX_WORKTREE_PATH/scripts/worktree/setup.sh"
```

清理脚本配置为：

```bash
bash "$CODEX_WORKTREE_PATH/scripts/worktree/cleanup.sh"
```

设置脚本会为工作树生成稳定的 `3100-3799` 端口，并写入工作树自己的 `.env.local`、`BETTER_AUTH_URL` 和 `NEXT_PUBLIC_APP_URL`。因此多个工作树可以同时执行 `npm run dev`。`.env.local` 和 `.codex-worktree-env` 都不会进入 Git。

## 数据库隔离

必须给每个工作树配置独立的 Postgres database（或至少独立 schema），例如 `hirelix_wt_<slug>`，再把该连接串写入工作树的 `.env.local`。不要把生产库 `hirelix` 直接用于多个工作树；否则一个工作树的迁移、登录数据和搜索任务会影响另一个工作树。

数据库创建和迁移需要显式执行，避免 Codex 设置脚本误改 VPS 数据。完成迁移后，再在对应工作树运行 `npm run dev`。

## 调度器隔离

`npm run scheduler:dev` 是持续消费搜索任务的独立进程，不能每个工作树各启动一份。开发联调时只启动一个指定工作树的 scheduler，并确保它连接同一个开发数据库；其他工作树只运行 Next.js。生产环境的 `hirelix-scheduler` 不受这些本地工作树影响。

## OAuth 回调

每个端口都是不同的 OAuth origin。若要在某个工作树测试 Google 登录，需要把该工作树的
`http://127.0.0.1:<port>/api/auth/callback/google` 加入 OAuth 客户端的允许回调地址；否则使用已有登录 cookie 的页面或不测试 OAuth 的功能。

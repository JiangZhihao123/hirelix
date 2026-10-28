# Agent 冷启动改造：发布准备

状态：本地准备，未 push、部署、连接或修改生产数据库/服务。本文的命令是待审阅的操作草案，不是执行授权。目标 SHA 必须在发布批准时重新确定；当前本地 `origin/main` 快照也不能代替生产读回。

## 运行边界与已知风险

Vercel 负责 Web/API；`scheduler/index.ts` 启动 us-2 的 private workspace worker，实际主 Agent 及 `write_file`、工作区 `read_file(path)`、`bash`、批量持久化和定时会话在 worker 侧执行。工作区镜像为 `hirelix-agent-sandbox:1`，运行时禁止自动拉取，Docker 不可用时文件工具显式失败，不在宿主执行 Bash。公开检索走受控业务工具；容器本身无网络、无宿主目录、Docker socket 或应用凭据。每租约 128 MiB tmpfs，输入另限 128 MiB；单命令 60 秒、容器 1 CPU/512 MiB/64 进程，具体上限以代码为准。镜像 Node 基础标签与 npm lock 明确，但 Debian apt 包未锁定，仍须记录目标机镜像 ID 和实际依赖版本；Docker 使用宿主内核，不是独立虚拟机。

强杀后，worker 的现有恢复会撤销过期租约；新回收逻辑仅处理与当前 PostgreSQL 集群/数据库身份匹配、带 Hirelix 标记、至少存在五分钟且原租约已清除或替换的资源，每五分钟运行一次。数据库或 Docker 不可用时保留资源并报错。旧版只有 scope 标签的资源不会自动回收，须在确认对应旧租约已失效、资源归属和其他工作负载后逐项操作，禁止全局 `docker prune`。如果数据库连接的服务端地址或数据库身份改变，旧标签也会保守保留，需要人工核查。

Docker daemon 访问通常等同于宿主高权限：发布前由负责人明确 worker 账号、socket 授权和共享主机隔离方案；不要只为通过健康检查把用户随意加入 docker 组。已有 CI/CD 的 main push 会触发 Vercel 发布和 us-2 worker 更新；工作流不构建镜像或执行迁移，也没有已验证的分阶段灰度开关。**先完成迁移、镜像和权限准备，再批准发布；不得假设可以在 push 后安全补做前置条件。**

## 已做的隔离库验证与迁移列表

从既有本地冷启动 QA 库复制结构至新隔离库，移除本次五项变更以重建待迁移基线，再依次应用下列文件：

1. `supabase/migrations/20261027_candidate_upload_parts.sql`
2. `supabase/migrations/20261027_imported_attachments.sql`
3. `supabase/migrations/20261027_record_batch_receipts.sql`
4. `supabase/migrations/20261027_schedule_agent_origin.sql`
5. `supabase/migrations/20261027_document_brief_kind.sql`

五项全部执行成功；迁移后以列类型/默认值、约束定义和索引定义的排序结果与原 QA 库比较一致。物理列顺序有差异，不作为语义差异。记录在本机 `output/recovery-qa/migrations-applied.log`、`schema-semantic-diff.txt`；这是重建的本地基线，不是生产快照，也不能证明生产此前应用了哪些文件。尤其第 1 项不是幂等迁移；生产必须先核实每项是否已执行或部分执行，不能盲目重复。

## 获得生产授权后的执行顺序

1. 记录精确发布 SHA、实际 `origin/main`、Vercel 当前部署及 `/opt/hirelix` SHA，检查服务器工作树与未完成任务；确认生产数据库模式、近期可恢复备份和恢复演练。迁移状态不明或出现部分执行时停止，先逐项比对实际列、约束、索引与迁移 SQL，不能靠文件名猜测。示例只读检查：

   ```sh
   git fetch --prune origin
   git status --short --branch
   git log --oneline --left-right origin/main...HEAD
   ssh us-2 'cd /opt/hirelix && sudo git status --short --branch && sudo git rev-parse HEAD'
   ssh us-2 'sudo systemctl is-active hirelix-scheduler postgresql'
   ssh us-2 'sudo -u postgres psql -d hirelix -v ON_ERROR_STOP=1 -c "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema = '\''public'\'' AND ((table_name = '\''hirelix_private_files'\'' AND column_name IN ('\''upload_id'\'','\''upload_part'\'')) OR (table_name = '\''hirelix_private_import_rows'\'' AND column_name = '\''batch_receipt'\'') OR (table_name = '\''hirelix_private_schedules'\'' AND column_name IN ('\''authorization_message_id'\'','\''source_authorization_message_id'\'','\''authorization_quote'\'','\''source_authorization_quote'\''))) ORDER BY 1,2;"'
   ```

   还要核对 `hirelix_private_files_upload_part_check`、`hirelix_private_files_upload_part_unique`、`hirelix_private_records_kind_check`、`hirelix_private_deliverables_kind_check`、`private_queued_person_index` 与 `private_queued_role_index` 的完整定义，并由实际应用数据库角色验证能查询 `pg_control_system()`、`pg_database`。不打印连接串或凭据。

2. 获批准并确保真实备份可恢复后，在明确的维护窗口逐项应用尚未应用的迁移，使用来自目标 SHA 的文件和 `psql -v ON_ERROR_STOP=1`；每项前后核对对象定义并记录结果。示例将已审核目标提交的单项 SQL 通过 stdin 交给数据库，不在宿主留下文件：

   ```sh
   RELEASE_SHA="$(git rev-parse HEAD)"  # 必须与获批准的 SHA 一致
   git show "${RELEASE_SHA}:supabase/migrations/20261027_candidate_upload_parts.sql" |
     ssh us-2 'sudo -u postgres psql -d hirelix -v ON_ERROR_STOP=1 -f -'
   ```

   其余四项按上述列表顺序各运行一次。任何失败、部分执行、约束与预期不符都停止；不要简单重跑非幂等迁移，也不删数据强行通过。

3. 用目标 SHA 的 `deploy/agent-sandbox/` 在 worker 主机或同架构可信构建环境构建，记录镜像 ID、Node/Python/库版本，并以真实 worker 账号验证 daemon 权限、tmpfs 与资源限制。示例在已授权后把目标提交中的目录传到一个新建临时目录，不依赖服务器当前 checkout：

   ```sh
   git archive "$RELEASE_SHA" deploy/agent-sandbox | ssh us-2 \
     'set -eu; staging=$(mktemp -d /tmp/hirelix-sandbox.XXXXXX); tar -xf - -C "$staging"; docker build -t hirelix-agent-sandbox:1 "$staging/deploy/agent-sandbox"; docker image inspect hirelix-agent-sandbox:1 --format "{{.Id}}"; printf "Review and remove staging directory: %s\n" "$staging"'
   ```

   构建需要外网，执行容器须验证无网络、无宿主凭据和 socket。核实该命令中的 Docker 账号就是 worker 实际使用的 daemon；明确容器运行的高权限边界。不可用时不发布依赖文件工具的版本。完成后只清理由该命令创建的临时目录。
4. 以目标 SHA 通过构建、类型、lint、单测及相应真实依赖测试。确认服务环境变量仅存在且来自受控配置：Web 与 worker 连同一个正确的生产数据库，worker 有 DeepSeek、向量服务及产品配置，代理只按生产实际设置。切勿输出密钥。先确定维护窗口及部署操作者，且须知 main push 将同时触发现有自动发布；现有流程没有证明可灰度，除非先经授权调整发布机制并单独验证，否则按单批次发布。
5. 经单独授权推送后，分别核验 Vercel 目标 SHA/Ready/域名和 GitHub Actions 成功、us-2 SHA/systemd 活跃及日志；两处 SHA 必须与批准版本一致。系统活跃与 HTTP 200 只是健康信号。先用明确授权的隔离测试账号和虚构资料走登录、上传、自然委托、实际 Docker 处理、保存回执、后续检索、文档打开以及取消/恢复，核对租约、数据库结果、索引和资源；确认没有未授权外发。验证结果写明真实依赖、模型、浏览器及其边界。
6. 任一迁移、镜像、权限、目标 SHA、队列/账本、用户隔离、原文一致性或授权边界检查失败，即停止引流和继续放量；保留证据与已提交事实。健康 SQL 可用 `deploy/hirelix-health.sql`，日志注意不包含资料或密钥。恢复前确认旧进程没有继续产生副作用，避免对共享 Docker 使用全局清理。

## 回退原则

回退前暂停新写入并保留当前库、任务回执与文件，记录已完成操作。旧 Web/worker SHA 和镜像需在发布前已知且可恢复；只回退代码可能遇到新 `brief`、附件或定时授权数据，不能假设旧版本理解新数据。先在隔离库验证旧版本对当前结构及新记录的行为，必要时优先前向修复；数据恢复到新隔离库并切换、迁移回滚或更改生产服务都需要明确授权。不能通过收紧约束或删除新数据来使旧代码启动，也不能把本地回退演练写成生产回退已验证。

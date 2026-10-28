# 2026-10-28 冷启动改造生产发布与验收

状态：产品代码已发布；首轮真实生产验收完成了上传、持久化和索引，但发现测试数据范围问题，后续模型验收暂停。不是完整上线放行或真实用户价值证明。

## 发布

- 发布提交 `8821591df64665fb62920a2c839467b39b868906` 推送至 `main`。GitHub Actions [40621044908](https://github.com/JiangZhihao123/hirelix/actions/runs/40621044908) 的 build-and-test 和 deploy-scheduler 均成功。
- Vercel 部署 `dpl_4RsDP5zRaesLtQQ7yTRBb7ivBAof` 为 READY，`hirelix.online` 已指向该部署；该提交的 Vercel GitHub 状态为 success。us-2 `/opt/hirelix` 同一完整 SHA、工作树干净；scheduler active/running、NRestarts=0，`deploy/hirelix-health.sql` 的 stalled=0。
- 五项 `20261027_*` 迁移均先在恢复副本上演练，再逐项在生产应用。没有文件内事务的迁移使用 `--single-transaction`；有 `BEGIN/COMMIT` 的文件沿用自身事务，避免嵌套。生产实际回读 7 列、3 个索引和 5 个相关检查约束/外键，定义与演练一致。迁移前后均确认无正在执行或排队的工作，迁移前 30 分钟内无到期 schedule。
- 生产 x86 沙箱镜像 `sha256:75ea03e53b3de42f9fbdc03ca85f05bdfe3ea60435fc94b97ba64c5062656faf`，149,159,881 字节。以实际 root worker 所用 daemon 验证 non-root 1000、无网络、只读根、禁用 capabilities、无应用凭据/宿主 socket、1 CPU、512 MiB 内存、64 进程、128 MiB tmpfs 和 nofile 256；Node 22.23.4、Python 3.11.2 和文档/表格依赖加载成功。worker 使用 Node 20.20.2；未增加 docker 组或改变防火墙。构建前可用 8,953,852 KiB、构建后 8,337,320 KiB，之后健康复核为 7,971,644 KiB，均高于 4 GiB 停止线。只清理了本轮 probe 容器/卷和 build 临时目录，未清理其他 Docker 工作负载。
- 服务器没有 buildx，首次构建因 legacy builder 不支持 `--progress` 在开始前退出；移除该显示参数后构建成功。原始构建与 probe 日志留在本机受限备份目录。

## 备份和恢复

正式库的 custom-format 备份在发布前经 SSH 流式写入本机 0700 独立目录，备份文件为 0600、53,044,024 字节、SHA-256 `aac1fdecb1d82289dc347e88c6629af86dc06e9d63e790dd60a90d04f7ef329a`；未提交到 Git。备份位置：`/Users/noah/projects/hirelix-local-archive/production-8821591d-j42BzLPe/hirelix.dump`。

本机服务为 PostgreSQL 15，隔离 PG17 镜像下载部分层停滞，因此改在 us-2 PostgreSQL 17.9 中新建随机临时库、撤销 PUBLIC CONNECT，并从本机备份经 SSH 还原；没有把较低版本还原当成同版本证明。`pg_restore --exit-on-error` 成功，恢复的 53 张 public 表逐表数量和行内容哈希与当时正式库一致，schema-only dump 的差异为空；随后在该副本验证全部迁移并删除临时库。局部还原不包含整个 PostgreSQL 集群的其他数据库或全局角色；正式库 public 对象的 owner 均为既有 postgres。隔离演练首条本地 zsh 变量引用错误，SQL 未传出；核实目标列不存在后修正，正式库迁移没有该错误。

## 真实生产验收

用户授权的自有测试账号经真实 Google OAuth 登录。新会话 `ba5c9103-00a7-4163-b1b8-5621ab3d40f0` 上传纯虚构 ZIP（1,596 字节；SHA-256 `52424208c556bac5c0349bf6bea20c8a7855676dc87940f7a9ad8cd748193116`）。真实 worker job `572ab573-b2b2-4a83-8a8e-56084f6881a6` 以 DeepSeek 完成一次自然委托，attempts=1，状态 done；真实 `write_file` Docker 工作区和四次 `save_records_batch` 均有成功观察。

数据库回读：12/12 虚构人选、12/12 备注、3/3 附件和 1/1 职位保存，四个批次无失败/冲突/未处理；原 ZIP 哈希一致。12 条备注原文、原日期及 ZIP 行号全部一致；3 个附件的人选关联、原路径和抽取原字节全部一致，职位 JD 指向 `role.txt`。12 位候选人实际 embedding 索引完成，共 39 个片段；测试 job 的容器与卷在正常结束后已清理。随后在 Chrome 通过只匹配一条虚构邮箱的真实认证接口完成字段检索；这是确定性检索，不是语义检索验收。

本轮对话账本记录 consumed=117,384 单位，即 11.7384 credits；记录的可计费模型成本 $0.03912486。后台自动索引按现有产品契约包含在订阅内，其 embedding 供应商费用不在上述对话账本中，因此该数字不是全部实际供应商成本。没有发邮件或发布分享链接。

### 测试范围事件与未完成项

首轮任务要求“只使用这些虚构材料，不合并或修改其他记录”，但没有明确禁止浏览旧候选人。Agent 为核对去重调用了 `search_candidates`，界面显示返回了该账号已有的 4 位无关候选人以及新建的 12 位。该工具的 `listPeople` 返回 `p.*`，因此旧档案字段可能随工具观察进入模型上下文；本轮未捕获提供方原始请求，不能逐字段确认传输内容。无关档案具体内容未被本次验收主动读取；按测试开始时间核对先前已存在的 candidates、roles、records、deliverables 和 role_candidates，更新时间变化数均为 0，新建邮件投递与分享为 0。这些观察不能消除已发生的越出验收范围的列表读取。

发现后已暂停后续模型请求。生产自然语义检索、多人内部 brief、来源引用、原位修订及停止/续办尚未重跑；不能以本地历史通过或字段检索包装为这些生产链路通过。继续前须确保测试范围可被实际工具限制，或由负责人明确决定隔离的已授权测试条件；不读取无关内容、不通过充值、伪造会话或绕过授权来完成验收。真实完整 ATS 备份、生产并发、真实用户留存/付费仍未验证。

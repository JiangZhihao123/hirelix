# Agent 执行预算与暂停验收

日期：2026-10-29。仅本地修改和隔离库验收，未 push、部署或修改生产数据。

## 修改边界

- 移除 `stepCountIs(20)`。ReAct 根据实际工具观察继续，仍保留用户停止、租约撤销、额度检查与原有 15 分钟总执行预算。
- 总时间预算通过同一 AbortSignal 作用于模型及嵌套工具；时间、额度、输出长度耗尽返回明确的可续办暂停，页面不再将这些状态显示为普通任务失败。
- 复用现有停止/Continue、执行证据、工具回执和计费机制；未新增工作流、检查点服务、平台解析器、调用次数目标或业务判断提示词。

## 本地真实链路

Chrome 正常 Google 登录，本地网页与独立 worker 均连接新建的空库 `hirelix_workspace_qa_runtime_real_20261028`。输入沿用原始 Recruit CRM 50 行导出及 120 人虚构 seed CSV，文件字节未修改。自然请求要求导入、去重、保留备注与来源，不指定工具路径；没有联系人。

- conversation：`39c36be0-c05b-439a-ba3c-564d569806e3`；job：`30384d6c-f2e6-4b1a-b24e-44fd491febca`。
- 一次执行，约 154 秒、23 个 ReAct 模型轮次、18 次 Bash，状态 done，未要求人工 Continue。另有 2 次写入授权模型检查及 1 次标题生成；不将这些算作 ReAct 轮次，也不把调用次数设为自然任务的通过标准。
- 输入 170 行，49 条邮箱重叠，新增 121 人，库内无重复邮箱。此库原先为空，故不是前轮生产已有 William 情况下的 120 新人。
- 120/120 seed 人选、原始备注及电话逐项匹配；8 条多行备注逐字保留，12 个空电话保持为空。50/50 导出来源声明的数据行号与相应人选一致。没有全面重新评价所有模型生成的摘要、薪资解释和经历表述。
- Chrome 显示 121 人，打开末位 QA Reese BatchEP 可见第 120 条原始备注及来源。最终答复数量与数据库一致。
- 2 个批次、129 个索引任务均 done；该 owner 无排队、执行中或失败任务。最终账本 consumed_units=reserved_units=82905，call_reservations={}。没有邮件记录、职位或定时委托；执行工具记录无发送/分享调用。

暂停 UI 由真实服务写入受控时间暂停 fixture 后，在 Chrome 查看明确提示和 Continue。点击续办曾遇到本机 DeepSeek TLS 连接失败，Retry 后真实模型完成；该失败保留在日志中，不计为通过。15 分钟截止机制以受控时钟和真实 PG 测试验证，没有让真实模型空跑 15 分钟。

## 回归及证据边界

- 构建、TypeScript、修改文件 ESLint 通过；单元测试 507 通过、20 跳过（需专门启用的集成项另行执行）。
- 受控模型 + 真实 PG runtime 合约 7/7：超过 20 轮、输出暂停后 Continue 且副作用不重复、额度暂停、截止中断、旧租约不能覆盖用户停止/新执行、澄清续办、供应商错误后恢复。
- 真实 PG 遥测/模型中间件 3/3：失败调用关联、输出截断记录 usage 并释放预留。真实 Docker/worker 中断 3/3；真实 DeepSeek 计费链路 2/2；选定当前 PG 合约 7/7。
- 较广旧 PG 回归有 3 项失败，已在修改前 HEAD `6cd1ca88` 的源码归档及同一隔离环境复现：旧 import 重试、排队问题回答时机、旧 delegated deliverable 恢复。未将这些旧契约失败包装为全绿，也未扩大本次修复范围。
- 这次成功不证明任意导入资料都能正确解释，也不证明 18 次 Bash 是最优数量；证明此任务可以跨过原有 20 轮硬停止并一次完整交付。生产、真实 SaaS 原始 100+ 人导出、其他平台及更大规模未验证。

本机忽略目录 `output/runtime-optimization-20261028/` 保存 `real-import-evidence.json`、逐项核对 `real-import-summary.json`、账本 `real-import-settlement.json`、worker 日志及测试日志。页面证据为 `pause-ui.png`、`import-counts-ui.png` 和 `tail-candidate-ui.png`。最终 runtime 合约使用全新的 `hirelix_workspace_qa_isolated_runtime_final_20261029`，避免旧测试残留队列抢占脚本模型；与浏览器验收数据库分离。

# Agent 候选人删除能力验收

## 实现

新增 `delete_candidate` 工具，读取候选人后以 ID 和当前版本删除。要求当前用户消息明确授权删除该人或包含该人的无歧义集合；“保留指定人、删除其余人”先解析保留对象。只读分析、历史整理授权、文件或工具输出不能充当当前删除授权。授权引文校验负责验证来源，语义范围由 Agent 结合上下文判断，不使用关键词分支判断自然语言。

复用页面 API 的 `deletePerson`，仅新增可选事务 runner：Agent 的删除与持久化工具回执在同一事务提交；相同工具参数重放读取回执，不再次删除。保留已有用户隔离、版本冲突保护、关联记录/角色关系清理及共享源文件保护。删除成功后移除当前回复中指向该候选人的来源链接。历史推荐快照可能保留复制内容，此工具不是全库隐私擦除。

## 验证

本机隔离数据库 `hirelix_workspace_qa_queue_20261015`，独立可丢弃测试身份；未修改截图中原用户的候选人数据。

- 数据库集成：错误授权 403、跨用户 404、过期版本 409；中途异常回滚删除；成功后新工具实例重放回执；已取消任务不能删除。
- 数据库集成：被删除人的记录及独占源文件删除，保留候选人、其他用户候选人和共享源文件保留；不输出已删除候选人的可点击来源。
- 本地真实链路：生产 Agent 代码、独立 worker、真实 DeepSeek、真实 PostgreSQL。4 条独立测试候选人，要求保留指定两人、删除其余两人。任务成功；2 条 `delete_candidate` 已提交回执；重新查询只剩指定两人。对话 `584ffe2f-887c-436a-a41e-78e21614c71e`。
- 同一对话随后发送只读请求并明确禁止删除；任务成功，无删除回执，剩余名单不变。
- 全量单测 441 通过、7 项环境开关测试跳过；删除数据库集成测试单独启用后通过；TypeScript 和定向 ESLint 通过。

```bash
WORKSPACE_DELETE_INTEGRATION=true node --env-file=.env --env-file=.env.local --import tsx --test tests/workspace-candidate-delete.integration.test.ts
npm run test:unit
npx tsc --noEmit
```

真实链路证据保存在本地 `tmp/delete-candidate/`。未推送或部署生产。

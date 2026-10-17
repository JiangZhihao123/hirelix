# PDF 导入空字符与恢复状态修复

## 根因与修复

2026-10-17 本地失败任务的模型请求成功，但 PDF.js 提取文本包含 55 个 U+0000。使用原始文件、真实模型和事务回滚探针复现：`hirelix_private_import_rows.raw_text` 写入 PostgreSQL 失败，底层错误 `22021: invalid byte sequence for encoding UTF8: 0x00`。原先仅记录外层 Error，导致界面和日志无法定位。

- 文档读取统一出口去除 PostgreSQL text/jsonb 无法表示的 NUL，保留其他文本和原始文件字节。视觉读取与纯文本预览共用规则。
- Agent 子任务和独立 worker 日志记录执行阶段、错误因果链类型、错误代码及源码位置；不记录 SQL 参数、简历内容、原始异常消息或服务密钥。子任务先记录诊断，再持久化失败状态。
- 导入详情根据同一用户、同一文件、失败后新建的 profile/cv 来源记录及实际存在的候选人显示后续保存结果。失败任务不改写为成功；历史错误和重新读取入口折叠展示。不会将部分档案保存宣称为整份文件全部导入。

## 验证

环境：本机 localhost:3000 与独立 Agent worker，共用本机隔离 PostgreSQL `hirelix_workspace_qa_queue_20261015`；真实 DeepSeek 调用。

1. 原始 PDF 修复前稳定复现上述数据库错误；修复后相同文件解析与入库事务成功（探针事务回滚）。
2. Chrome 当前登录的本地测试账号与原失败账号不同。在当前账号通过 UI 上传相同 PDF、发送保存请求，chat/import 均首次完成，档案可打开且原文件已关联。上传前后 SHA-256 相同。
3. 原失败账号的导入详情回读显示历史 error 保留、后续已保存档案可正确查到；没有改写其候选人或失败任务。
4. Chrome 使用明确标注的历史失败界面夹具检查恢复展示：已保存档案和打开入口可见，红色错误条消失，历史详情可展开。此项仅为界面回归，不充当真实导入证据。
5. 从该界面的“Read file again”触发真实 worker 重读，任务完成并进入重复候选人审核；库中该候选人仍为一条。真实成功对话：`7346a1c2-127d-4f02-a71f-317947e170fc`。
6. 新增真实 PDF 字体 ToUnicode 映射 NUL 夹具，先证明 PDF.js 提取出 NUL，再验证清理与页面图像保留；同时覆盖文本文件和日志隐私。
7. 独立 PostgreSQL 集成测试覆盖跨用户拒绝、旧档案不能被视为后续恢复、note 不能替代 profile、缺失文件关联不能视为恢复、历史失败保留。

命令：

```bash
npm run test:unit
npx tsc --noEmit
npx tsx --test tests/workspace-document-reader.test.ts tests/workspace-error-diagnostics.test.ts
WORKSPACE_IMPORT_INTEGRATION=true node --env-file=.env --env-file=.env.local --import tsx --test tests/workspace-import-recovery.integration.test.ts
```

最终结果：全量单测 441 通过、5 个需显式环境开关的集成测试跳过；新增数据库集成测试单独启用后通过；7 项文档/诊断定向测试通过；TypeScript 与本次修改文件的 ESLint 均通过。真实 PDF、浏览器截图、探针脚本和日志保留在本地 `tmp/import-repair/`，不提交个人简历。未部署生产，未发送邮件，未运行外部付费人才寻访。

# 分支清理与独有提交核对（2026-10-19）

核对基线：`7b26dbd3`。只保留本地 main 和远端 main。

## 逐项处理

| 原提交 | 内容 | 处理 |
| --- | --- | --- |
| `5999762f` | 移出路由辅助导出以修复构建 | 与主线 `86398b15` 补丁等价，不重复合入 |
| `74f1885f` | 对话内 Gmail 状态、确认与发送 | 已由主线祖先 `8c5cc535` 保留；服务、API、合约、迁移和测试逐文件相同，其余四个文件差异是候选人编辑及导出能力的增量，不缺 Gmail 实现 |
| `e70ad051` | Personal Agent 产品设计优化方案 | 保留为 `c564eb31`；仍是历史讨论稿，不代表批准所有建议或当前验收状态 |
| `b9f4561c` | 委托邮件往来、附件及跨会话来源 | 与主线 `2aca35f3` 补丁等价，不重复合入 |
| `fbffa203` | 第一阶段本地真实闭环验收记录 | 与主线 `8cb319cb` 补丁等价，不重复合入 |
| `bec04be2` | 轻量反馈弹窗、提交后再次打开状态、独立帮助入口 | 保留为 `08090a3c` |

旧 personal-agent-v3、local-mail-recall 分支及远端 release 分支均已被主线包含。
其他 detached 工作树的 HEAD（`8c5cc535`、`a9ccb7df`）均在主线历史内。
上述旧分支已删除，重复提交不重新引入。

## 本次验证

- `npx tsc --noEmit`：通过。
- 修改组件 ESLint：通过。
- `tests/product-feedback.test.ts`：1 项通过。
- `tests/product-feedback.integration.test.ts`：启用 FEEDBACK_INTEGRATION，在本地隔离库 hirelix_workspace_qa_queue_20261015 运行，1 项通过；覆盖真实 PostgreSQL 去重、限流、图片校验、身份隔离及分页，测试数据自动清理。
- 三个反馈相关源码文件与原提交逐文件一致；原 Chrome 验收见 `docs/product/feedback-lightweight-verification-20261019.md`。本轮未重复浏览器操作，未测试外部通知邮件，也未重新验证 Agent 或生产完整链路。

## 保留边界

其他工作树的未提交文件、tmp 以及原有 stash 不属于本次独有提交清理，不删除、不合入。Gmail 工作树的 tsconfig 变更仅为格式和本地 .next-build 类型路径，不是产品功能遗漏。

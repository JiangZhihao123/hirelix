# 邮件发送反馈修复

生产原对话的发送回执为 sent，并有 Gmail provider_message_id；这只证明 Gmail 接受发送，不证明收件人收到。收件地址使用保留的 .test 域名。原页面遗漏 email_result，且无流式 live_reply 的已完成任务隐藏持久回复，导致确认发送后空白。

修复：独立邮件卡片显示收发件人、主题、正文、附件及状态；发送结果显示于确认后的回复；旧回执继续保留，同时标注保留域名风险。共用 composeGmail 在 OAuth/发送预留之前拦截测试和示例域名。Gmail 接受、失败、发送中和结果未知分别展示；不声称读取退信，不自动重发未知结果。用户在对话中修改邮件后重新确认。

验证：436 单元测试通过，4 项既有跳过；新增邮件 UI 回归通过。独立本地 PostgreSQL hirelix_workspace_qa_email_20261017 的 11 项邮件集成测试通过，包括回执恢复、重复预留保护和发送前地址拦截。TypeScript、生产构建通过；ESLint 无错误，有一个既有 integration/workspace-batch-intake.test.ts 未使用变量警告。

未发送新的真实邮件；生产验收使用原始真实 Gmail 回执查看渲染。当前 gmail.send 权限不能读取退信或确认最终到达。

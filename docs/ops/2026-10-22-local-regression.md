# 本地真实链路回归与两项修复

日期：2026-10-22，Asia/Shanghai。范围：本地隔离 PostgreSQL、`npm run dev` 网页与 Agent worker、真实 DeepSeek 模型。不涉及生产部署或真实外部发信。

## 环境

- 数据库：`hirelix_workspace_qa_local_20261022`，从既有 QA 库复制表结构，未改动历史 QA 数据。
- 网页与 worker 同库：`http://127.0.0.1:3000`，worker concurrency 2。
- 模型：DeepSeek 官方 API，真实调用并写入 `hirelix_llm_usage_events` 与 `hirelix_agent_credit_usage`。
- 测试材料：虚构高级后端工程师 JD、3 人 CSV、1 份候选人简历文本。

## 范围与结果

| 链路 | 结果 |
| --- | --- |
| 上传 JD + 3 人 CSV → 保存职位/建档 → 比较 | 1 职位、3 候选人；比较结论正确（Mara 最合适、Owen 备选、Priya 时区与管理岗冲突） |
| 英文客户推荐文档 | 保存为 v2；PDF 2 页、DOCX 可导出 |
| 推荐交付包 | ZIP 含 Recommendation.pdf；无原始 CV 时不虚构附件 |
| 一次性提醒 | 创建后按时送达本对话，通知标记已读 |
| 运行中停止 → 新指令继续 | job `cancelled`、conversation `stopped`；继续后恢复并完成，事实未丢 |
| 跨账号隔离 | 另一账号读取会话与文件均 404 |
| 账本 | 数据库 249,492 units 与界面 24.95 credits 一致 |
| 上传边界 | 不支持类型、空文件、5MB 文件均 400 与明确文案；有效文件 200 |
| 导入幂等 | 同一 `request_key` 重复提交返回同一 job，未重复创建 |
| 删除候选人 | 旧版本删除 409；正确版本 200；重复删除 404；候选人记录级联清理，文件与推荐文档保留 |
| 11 个产品页面 | 全部 200，无控制台报错（修复后） |

## 发现并修复

### 1. 英文 Word 导出无差别嵌入中文字体

一份 5KB 英文推荐文档导出的 DOCX 为 6.3MB。`src/lib/workspace/document-export.ts` 无条件嵌入约 10.6MB 的 `NotoSansSC-Regular.ttf`。

修复：仅当标题或正文包含 CJK 字符时才读取并嵌入字体；英文文档不再携带字体。导出体积从 6.3MB 降至约 10KB，中文文档仍完整嵌入。新增两条测试覆盖英文不嵌入、中文/中文标点必嵌入。

提交：`dca464cc`。

### 2. 增长埋点在主机名归一化后被全部拒绝

工作区页面每次访问向 `/api/growth/landing-event` 发送埋点，但用 `127.0.0.1` 访问时全部 403。原因是 `req.nextUrl.origin` 被归一化为 `http://localhost:3000`，而浏览器 Origin 是 `http://127.0.0.1:3000`。同类问题在生产遇到代理或别名域名时也会静默丢失事件。

修复：允许来源同时包含 `nextUrl.origin` 与由请求 Host/`x-forwarded-host` 推导的来源；跨站 Origin 仍返回 403，并记录拒绝日志。验证：`127.0.0.1` 与 `localhost` 通过，`evil.example` 仍 403；页面控制台错误清零。

提交：`626b5455`。

## 观察项（未修改）

- 伪造 PDF 导入返回任务 `error`，界面文案为通用提示“This task could not finish…”，日志保留 `job_id`、`phase=prepare` 与 `InvalidPDFException`。用户可重试，源文件保留；未为单一格式增加特殊文案。
- 本地 `GMAIL_READ_ENABLED=false`、`MICROSOFT_MAIL_READ_ENABLED=false`，邮件设置页如实显示“Reading not supported yet”，与配置一致。
- 删除候选人后，旧对话中的候选人链接仍保留，页面返回空态而非 500；API 返回 404。

## 未验证

- 独立外部寻访（Bright Data 付费召回）已于 2026-10 下线，不在本版范围；搜索流水线中的历史代码仍保留，但 `EXTERNAL_SOURCING_ENABLED = false` 阻止新增任务。私人候选人库检索是独立链路。
- 真实发信、真实支付与订阅变更：会产生外部副作用，本轮未执行。
- 完整搜索流水线（解析 → 召回 → 筛选 → 深评）属于已下线的外部寻访，未在本地重跑。

## 证据

- 测试材料与截图：`tmp/local-test-20261022/`（未跟踪，不进入 Git）。
- 会话：`7edde874-272f-48af-b65e-49b5e6af1508`。
- 职位：`b1307df0-9f4d-4d0c-8371-8f24121ee58e`。
- 推荐文档：`259ef289-536f-4b25-b248-725ecc1df1f0`。
- 单元测试：491 项，482 通过、9 跳过、0 失败；`tsc --noEmit`、相关 ESLint 通过。

# Agent 上下文、工具、文稿预算与执行证据优化

2026-10-23；基线 `84d8eb99`。本记录区分历史审计、当前代码与真实隔离库验证，不把最终 done 等同全程没有失败。

## 对话上下文

当前注入和 `read_conversation` 共用模型消息投影。只移除重复 UI/诊断字段 `parts`、`agent`、`activity`、`reply_request_key`，保留完整正文、消息 ID/时间、来源、选择对象、附件、未完成状态、业务回执及未知的语义 metadata。取消后的非空正文仍带取消状态。过滤尚未交付及删除消息；最近 30 条的既有窗口明确返回 `has_more` 和向前翻页边界，不裁剪消息正文。原始存储与 UI 不变。

对原审计样本只做生产只读聚合：正文 8,167 字符保持完整；metadata 从 20,400 降至 3,508 字符（减少 82.8%）。这是 metadata 投影体积，不是总输入或 token 的降幅。

## 工具定义

43 个工具均保留。重复的完整授权规则改为系统共享说明；精简重复表述。发送给模型时移除 schema 文档注解及 Zod UUID 的重复正则，保留 `format=uuid`；实际调用和修复仍经过原始 Zod schema。归属、版本、授权、来源、幂等及副作用执行逻辑未弱化。

按原审计的逐工具 `{description,inputSchema}` JSON 口径：82,864 → 61,433 bytes，减少 25.9%。加入历史翻页后、压缩前的同口径为 83,170 bytes；其中工具说明 18,947、schema 62,804 bytes。压缩后工具说明 15,343、schema 44,671 bytes。

真实 SDK 发送的工具结构包含名称等封装，为 62,439 bytes。新隔离会话第一次调用：system 20,367、messages 635、tools 62,439 bytes，provider 实报输入 22,152 tokens。字节不是 token；不能将历史首轮 29,390 tokens 全归因于工具，也不能跨不同会话宣称 token 节省比例。

## 文稿预算与费用

仅推荐文稿、进展报告及大幅修订使用初次 32,768、截断后一次 65,536 的输出上限，超时 360 秒；其他结构化调用保留 7,000/14,000 和 120 秒。保持模型与 configured thinking，不改字段上限或证据要求。额度预留仍以峰值费率和保守输入边界约束实际可用输出；被额度压低后截断直接交回，不再以同样不足的上限整段重做。每次尝试结束释放未用预留，仅有效结构化响应计用户额度；失败 provider 用量保留。

真实选择过程：16,384 上限调用全部消耗于思考，85.628 秒截断；32,768 的重试以 9,958 token（8,411 思考）完成，48.608 秒。关闭 thinking 的对照虽在约 8–10 秒返回，却违反 opening/closing/recommendation 长度约束，并出现无效 JSON；该方案撤回，失败记录保留、未计用户额度。

最终采用同一份冻结源与原 schema：一次完成，5,409 输入、21,270 输出，其中 19,863 思考、约 1,407 正文，耗时 108.354 秒。保存 5,743 字符内部文稿，保留 2 人、6 条记录来源；provider 成本 $0.0271467，最终 reserved_units=consumed_units=81,441。相对于本次 16K+32K 的重做样本少一次请求；这是代表样本，不能承诺长期耗时或失败率。

依据：[DeepSeek 输出参数](https://api-docs.deepseek.com/api/create-chat-completion/)、[thinking 机制](https://api-docs.deepseek.com/guides/thinking_mode/)。

## 执行关联

复用 job result 中的追加式 `agent_steps`/`agent_events` 和 usage 的 metadata，不增表。执行 ID 在手动重试重置 attempts 后仍唯一；步骤只追加，最终保存不再覆盖前次执行。模型请求有独立调用 ID 与 SDK/provider attempt；工具保留 SDK 调用 ID、排队/执行耗时、结构化成功/错误；子任务通过 parent job/execution/model/tool 关联，包括由另一 worker 接手的情况。结构化解析/校验结果与 provider 调用成功分开记录。

新证据不记录提示词、来源正文、授权引文、工具参数/私有结果或 provider 私有错误正文。旧租约不能追加结果。租约丢失留下未配对 start 和进程日志的 end，不伪造完整执行。显式邮件确认仍走合理快捷路径，不要求生成 agent_steps。

## 验证和边界

- `tsc --noEmit`、ESLint、production build 通过。
- 单元测试：513 项，495 通过、18 个需独立环境的集成项跳过。
- 独立 PostgreSQL 合同回归：8/8，覆盖原子回执/重放/停止恢复、旧租约、重试历史、SDK 失败后成功的关联、截断/结构错误计费及预留释放。强制故障使用 mock provider/transport，数据库是真实隔离库。
- Chrome → 本地 Next.js → 独立 worker → PostgreSQL → 官方 DeepSeek 真实链路通过。网页和 worker 同用 `hirelix_workspace_qa_local_20261022`；真实会话 5 步、8 次工具执行，保存文稿 v2，当前记录与选择正确传递。最终预算另用冻结输入的真实服务验证并在 Chrome 打开保存文稿。
- 旧 QA 账号额度不足的首轮收尾失败单独保留，未包装成成功。后续用了临时本地额度 fixture，完成后恢复；未改生产额度、发送邮件、支付、读 Gmail 或删除生产数据。
- 本次没有重跑整站浏览器套件，也没有验证所有文稿规模/模型/视觉输入或故意制造生产失败。
- 本地汇总与脱敏证据保存在 `tmp/agent-optimization-20261023/`。生产部署后另核对最终 main、CI、Vercel 和 worker SHA，以及实际生产冒烟回执。

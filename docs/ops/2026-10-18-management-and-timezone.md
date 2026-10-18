# 管理范围与用户时区验收

## 修复

- Agent 对话、职位评估和推荐生成共用的证据约束明确区分管理人数与直接汇报人数。缺少汇报关系时保留未确认，不能补成具体人数或零。
- 工具结果及请求上下文在模型边界增加 `local_times`：按本次请求的 IANA 时区换算结构化时间，保留日期、秒、UTC 偏移和时区名。原始数据与已提交工具回执不变；日期型事实及来源正文不做转换。
- 真实回归发现口述 JD 偶有格式重写，保存工具进一步明确逐字保留原始措辞与格式。

## 本地真实链路

独立 PostgreSQL `hirelix_workspace_qa_queue_20261015`；真实 DeepSeek；`npm run dev` 独立 worker；Chrome 登录会话。

- `WORKSPACE_REAL_AI_TEST=true npx dotenv -e .env.local -e .env -- npx tsx --test tests/integration/workspace-role-evidence.test.ts`：3 项通过。
- 相同反馈时间 `2026-10-17T20:20:32Z`：上海为 10 月 18 日 04:20:32 GMT+8；纽约为 10 月 17 日 16:20:32 GMT-4。两次对话均将“管理过五名 PM”的直接下属人数列为未确认。
- Chrome 对话 `4de88543-e9b2-4cb3-ad54-a5ce52846d76`：Aster 管理过六名 PM，直接下属未确认；Blair 明确三名 PM 直接汇报，确认三名。真实读取 Mara/Tessa 的客户反馈，显示 2026-10-18 16:05:13/16:05:53 GMT+8，标明 Asia/Shanghai。
- `npm run test:unit`：461 通过，8 个原有跳过；新增跨日、Date 对象、原文/日期不变、夏令时重复小时测试通过。
- TypeScript、ESLint、生产 build 通过；ESLint 有原有 `workspace-batch-intake.test.ts` 未使用变量警告。

## 边界

这是证据约束与时间表示修复，不通过后处理改写模型自然语言。真实模型回归是样本验证，不是任意表述零错误保证。只读验收不发送邮件、不改已有业务资料；生产部署与复验须另外核实实际版本及回答。

补充边界核验：Drizzle 原始查询返回 PostgreSQL 文本（如 `2026-10-18 04:20:32+08`），不是 ISO。转换器已覆盖空格分隔、短偏移及微秒；新增单元测试与真实数据库断言验证 `local_times` 确有生成。修复后上海/纽约独立 worker 对话复测通过（`16a3dac3-b23a-480e-be38-ead30c1f5289` 等）。推荐生成的管理范围回归另行通过。

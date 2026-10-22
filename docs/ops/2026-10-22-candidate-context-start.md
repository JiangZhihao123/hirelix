# 从候选人资料接着工作

## 产品衔接

候选人详情的 Ask your AI assistant 已能带入人选引用，但空白对话仅展示通用开场，已有的起步按钮反而在选择候选人后隐藏。首次保存资料后的用户和再次回来的用户，需要自行猜测如何使用这些资料。

复用现有 ConversationStarters，在仅选择候选人、无文稿/职位且输入框与附件为空时提供三个可编辑起点：找现有机会、准备候选人沟通、回顾候选人记录。请求读取已保存资料并明确保持分析范围；点击只填入输入框，不启动任务或业务写入。保留原有通用起点和草稿/附件优先规则，英文与中文对应文案同步。

这是界面提供的工作建议，没有新增流程实体、固定工具顺序或候选人判断逻辑。

## 本地真实验证

环境为本机 Chrome Computer Use、真实模型与 worker、隔离库 `hirelix_workspace_qa_local_20261022`，沿用虚构 Taylor 和已有六个职位。

1. 当前落地页首屏主 CTA 能进入可编辑首次委托，未自动发送；页面支持一份简历起步，无须先建全库。
2. 手动选择 Taylor 发起只读的现有机会分析，对话 `e428afae-4843-4d08-8bd7-90ccfe347bdc`，实际读取候选人及六个职位，任务 `a7347894-4667-4c66-baa1-b2bbf4c8c521` done。可见回答使用了 22 October 新 CV 的 Tableau 描述、已有反馈和不同职位条件；旧评估没有被自动改写。
3. 从分析中的候选人引用打开详情，再点 Ask your AI assistant，真实页面显示三个新起点和 Taylor 引用。点击 Find roles for this candidate 只填入请求，三个起点随非空草稿收起，未自动创建对话或任务。
4. 追加 Focus on current openings 后刷新，完整编辑文字和 Taylor 引用仍在。主动发送后，新对话 `a05345b8-cf7c-467f-b63d-e19a92746622` 的用户消息包含该候选人引用和编辑后的请求，真实 worker 完成分析；实际工具为读取候选人、列出现有职位、读取职位详情。没有要求用户重传 CV。
5. 两次分析前后，对 people、roles、records、role_candidates、deliverables、document_shares、email_deliveries、versions、files 全表行数及按 id 排序的 JSON 指纹逐一比较，全部一致。消息、任务及真实 AI 用量会增长，不属于“不改业务记录”的断言范围。仍为 9 人、6 职位、44 记录、12 职位人选关系、6 推荐、17 文件、0 邮件投递；原测试分享仍撤销。

## 模型观察及验证边界

回答能找回新版 CV、不同职位要求和旧反馈，但不将具体排序当成工程验收必选答案。第二次回答将 185k 在 170–200k 区间称为 top quarter，实际为中点，并把“CV 未声明直属下属”表述成更强的“CV 明确没有”；对 Harborlight 分享许可也没有再次强调其原文件范围。原始资料与权限未丢失，未据单次业务推理偏差增加案例分支、自动修补或固定提示词流程；本次只读分析也不构成后续分享授权。

本轮没有把模型业务结论全部正确、未来请求必定同样执行或任何生产能力标记为通过。真实发送验证覆盖找现有机会的按钮；准备沟通、历史回顾的按钮可见，未分别再发起模型任务。

TypeScript、lint、git diff --check 通过；全量单测 507 项，492 通过、15 门控跳过、0 失败。入口展示变化以实际 Chrome 点击、刷新、消息和持久结果为主要证据，没有新增复刻按钮文案的单测。截图和只读检查在 `tmp/candidate-context-starters.png`、`tmp/reverse-opportunity-*`、`tmp/candidate-starters-*`，不提交 tmp。

同轮发现 `e2e/seo.spec.ts` 的无 JavaScript 产品事实检查仍要求 Two or three resumes，实际首页已支持 Start with one resume。先运行该用例确认仅旧文案断言失败，再同步为当前一份简历起步的承诺；同一用例复验通过。执行使用 `PLAYWRIGHT_BASE_URL=http://localhost:3000 PLAYWRIGHT_REUSE_SERVER=1`、chromium 项目和该用例的 grep，仅运行 HTTP request 检查，复用原服务，没有启动第二个 worker。这项不冒充整套 E2E 或无登录注册流程验收。

未推送、部署、外发或付款，未重启/清空数据库，保留 Owen 待定选择及既有提醒。

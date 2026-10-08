# Personal Agent v3：验证范围与交互原型

日期：2026-10-08。验证代码基线：`2fa7faf`。

**v3 是设计方案，尚未整体实现，不能声称八个场景已经验收通过。** 本轮分别验证现有底层能力、当前线上 UI，以及新方案的交互原型。原型使用虚构数据，不调用 AI、不保存资料，不作为业务链路成功证据。

## 可查看的 UI

[英文交互原型](prototypes/personal-agent-v3.html)可在浏览器直接打开，无构建和外部依赖。

- 默认主要工作区为对话，左侧提供历史及候选人/职位资料入口。
- 匹配结果直接回答理由和待核实事项，附来源链接与覆盖范围。
- 点击来源在右侧展开资料，保留原对话和输入位置。
- 准备沟通在同一界面展开内容，不创建待办或待审核草稿。
- 新建对话只提供简洁开场。文件上传与发送仅为原型占位，不代表已实现。

本轮使用真实 Chrome 引擎（Playwright、1440 × 980）验证：来源打开/关闭、准备沟通、新建对话、恢复示例对话。检查截图未发现文字截断或面板覆盖输入框。本轮未验收实际产品中的新面板、实时生成、上传、保存或刷新恢复。

本地截图在 `output/personal-agent-v3-review/`：

| 文件 | 内容 |
| --- | --- |
| `00-current-production.png` | 当前线上首页，仍有待审核草稿，非 v3 |
| `01-conversation.png` | v3 原型：匹配回答 |
| `02-source-panel.png` | v3 原型：来源面板 |
| `03-preparation.png` | v3 原型：沟通准备 |
| `04-new-conversation.png` | v3 原型：新对话 |

## 已执行测试

使用新建的本机隔离 PostgreSQL 数据库 `hirelix_workspace_qa_v3_review_20261008`，从已有 QA 库仅复制 schema，不复制生产记录；测试数据为虚构资料。真实检索调用 embedding 服务，记忆测试调用真实模型。没有发送邮件、创建公开分享或执行付费外部人才寻访。

- `workspace-jobs.test.ts`：三项通过。真实数据库验证并发领取、过期租约不能提交/续约、重复中断与手动重试身份、失败可见。错误处理用主动抛错触发；不能当作实际服务器重启或外部故障演练证据。
- `workspace-retrieval.test.ts`：一项通过。真实 embedding 检索在 130 个较新干扰档案之外找回旧候选人，检查用户隔离和来源。覆盖的是现有候选人检索，未证明 v3 JD 检索、所有格式解析或全量召回质量。
- `workspace-personal-memory.test.ts`：纠正环境后复验三项全部通过，耗时约 96 秒：跨对话记住/更正/使用/忘记并保留来源、并发版本冲突保护、精确读取已保存文稿并接续修订。首轮遗漏 `.env` 中模型配置，报 `OPENROUTER_API_KEY is missing`，后两项因前置 fixture 未产生而失败。纠正配置加载后重跑同一文件，没有移除断言。

日志保留在上述本地 output 目录：`real-tests.log` 保存首轮 4 通过/3 失败，`memory-retest.log` 保存纠正环境后的结果。配置凭据不进入文档和 Git。

复现命令（在已准备好 schema 的隔离 QA 库运行）：

```bash
DATABASE_URL='postgresql://noah@127.0.0.1:5432/hirelix_workspace_qa_v3_review_20261008?sslmode=disable' \
WORKSPACE_REAL_AI_TEST=true PROXY_ENABLED=true PROXY_URL=http://127.0.0.1:7890 \
npx dotenv -e .env.local -e .env -- npx tsx --test --test-concurrency=1 \
  tests/integration/workspace-jobs.test.ts \
  tests/integration/workspace-retrieval.test.ts \
  tests/integration/workspace-personal-memory.test.ts
```

注意记忆测试的文稿修订仍验证当前“提案后应用”行为。这能证明当前读写/版本链路，不代表 v3 直接修改交互已实现。

## 八场景的验收缺口

| 场景 | 本轮证据与缺口 |
| --- | --- |
| S1 JD | 新统一 JD 检索未实现/未验收 |
| S2 简历 | 候选人索引与来源有真实测试；上传、解析、更新/删除索引的完整 UI 链未在本轮重验 |
| S3 匹配 | 候选人语义召回通过；双向 JD 检索和对话比较尚未完整验收 |
| S4 沟通 | 新交互原型通过点击检查；真实基于历史笔记生成未在本轮验收 |
| S5 推荐 | 测试包含现有文稿接续；新面板、直接修改、导出/发送未完整验收 |
| S6 反馈 | v3 从反馈更新到后续评估的连续故事未验收 |
| S7 约定 | 一次提醒和简化周期报告未实现/未验收；队列测试不代替调度验收 |
| S8 回顾 | v3 按需回顾未验收，原型不模拟完成此能力 |

应先实现相应能力，再按架构方案第 11 节逐场景补齐真实数据库、模型、worker 和桌面浏览器证据。不得把本轮局部通过合并为“全部测过”。

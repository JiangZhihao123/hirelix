# 经历语义搜索真实链路验收（2026-10-15）

## 范围与环境

Chrome 已登录用户在 localhost:3000 候选人页面发起真实 POST /api/workspace/jobs，页面轮询任务并展示持久化结果。使用现有 8 条虚构候选人资料及完整索引，真实 SiliconFlow Qwen/Qwen3-Embedding-8B、PostgreSQL 向量检索，没有模拟 provider 或结果。

本地网页与服务器旧 scheduler 共用数据库。最初任务被旧 worker 执行，小写 london 返回 0 条；这不是本地新筛选逻辑的通过证据。为验证本地版本，临时限定执行器只认当前 QA owner、新建时间及完全相同的测试 query，在数据库临时函数中原子领取本次任务，再由本地 retrieveJob、agentCreditContext、heartbeat 和 finishJob 执行。没有部署、停止或更新服务器 scheduler。临时函数随连接结束消失，执行器在验收结束停止。

因此本记录证明本地新代码的真实服务链路；普通本地网页继续使用共享数据库时，仍可能由旧远端 worker 执行。正式联调需使网页和 scheduler 使用同一代码版本，或使用隔离开发数据库和 worker。

查询：Find product leaders with B2B SaaS platform and enterprise workflow experience.

## 已完成任务及浏览器结果

| 地点 | 专长 | 结果 | 本地执行的任务 |
| --- | --- | --- | --- |
| london | strat | 2 人，Tessa / Priya，均为 London、Product strategy | 8f97033f-40f6-4d5e-a6cb-37d8e1b4d4b7 |
| london | 空 | 6 人，含 London, United Kingdom | b56c5888-1a3f-4da0-827b-9db1990c6afe |
| bristol | work | 1 人，Avery，Bristol, United Kingdom、Workflow products | fdb9c53a-2e6a-4cec-9d23-7215ff091339 |
| bristol | strat | 0 人 | e1bbf842-3e16-47f2-824b-800192aebc6d |

上述结果均在真实 Chrome UI 读取，并核对持久化任务。前四次本地成功调用（含下述迟到任务）的计费记录显示 private_semantic_search / siliconflow / Qwen/Qwen3-Embedding-8B，每次 16 input tokens；未伪造向量或候选人。

## 发现并修复

地点/专长变化原本能清除任务，但修改经历描述仍展示旧建议；创建任务的 POST 未返回时改变筛选，旧响应也能重新挂回任务。

- 经历描述变化立即取消当前结果绑定。
- 语义模式地点/专长不再等待 300ms，输入后立即清除旧结果；关键词模式仍保留 debounce。
- 搜索请求记录版本；修改描述、筛选、模式或清除条件使旧请求失效。旧 POST 的响应和错误不覆盖新条件。
- 重新搜索时先清除上次结果。

修复后实测：把描述改为 finance，6 人旧列表立即清空。再次发起 London 查询，在 POST 返回前改为 Bristol；旧任务 28896b21-8127-43af-bb76-55ef4ca76c44 最终 done、6 人，但页面始终保持 Bristol、无 task、无旧结果，随后 Bristol+work 搜索正常返回 1 人。修改专长为 strat 后旧 1 人立即消失，重新搜索得到 0 人。

TypeScript、修改文件 ESLint、git diff --check 通过。本次没有重跑整个生产构建。

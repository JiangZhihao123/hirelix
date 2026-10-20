# DeepSeek Search / Fetch 接入与验收

日期：2026-10-20。本地代码与隔离 PostgreSQL 验收，未推送、未部署。

## 变更

- `web_search` 直接调用官方 `POST /v1/tools/search`，替换模型 Messages API 内置搜索。沿用 DeepSeek 密钥，不添加依赖、数据库表或业务工作流。
- 查询最多 128 个 Unicode 字符；支持 `count`（1–50）和 `need_content`。保留服务端返回的 URL、短摘要、长摘要、正文、日期和相关度/权威度信号；摘要不作为原文引语，分数不直接决定事实真假。
- 新增 `web_fetch`，通过官方 `POST /v1/tools/fetch` 读取公共 URL 的 Markdown。Agent 按目标决定何时搜索、读取和继续核实。正文、摘要都属于不可信外部证据，不能提供执行指令或业务授权。
- 两个工具在原对话记录真实进度和来源链接。空正文不产生已读取的来源；正文截断明确标记。Search 每项正文最多 12,000 字符、合计 60,000，Fetch 最多 40,000；不会声称读取未返回的内容。
- 检索不再生成虚构的模型 token 用量。复用现有额度账本，按有效请求各 USD 0.00075 预留和结算，并保存请求数、成本、倍率和价格版本。失败、无结果、无正文不扣检索费用。Agent 思考和回答自身的模型调用仍单独按 token 结算。
- 对 408、429 和 5xx 在同一 90 秒截止时间内最多重试一次；鉴权、参数、目标拒绝、格式错误不盲重试。网络响应丢失不自动重发，避免不确定的重复付费。

官方依据：[Search & Fetch](https://api-docs.deepseek.com/guides/search/)、[Search schema](https://api-docs.deepseek.com/api/search/)、[Fetch schema](https://api-docs.deepseek.com/api/fetch/)。直接 API 使用公开的按次价格；文档对 Harness / Claude Code / Codex 服务端工具调用的临时优惠不作为 Hirelix 直接 HTTP 接入的免费依据。

## 验证

本地隔离库：`hirelix_workspace_qa_jd_20261019`，仅使用新建 QA 用户与公开网页，不读取真实候选人或客户资料。

### 本地真实链路

- 真实 Search 返回官方文档结果；`need_content=true` 实际返回页面正文。真实 Fetch 返回官方 Search/Fetch 指南 Markdown。
- 首轮接口任务 `43c557a8-8043-44e3-a410-dbd35420d081` 的账本读回：Search 和 Fetch 各 USD 0.00075，合计 USD 0.0015、4,500 个整数额度单位；请求快照分别为 `private_web_search` 和 `private_web_fetch`。
- 首轮完整 Agent 任务 `f3434af7-45e2-4631-8655-1b6a3860be31`、对话 `672ab0b9-5cd7-46b5-a62b-b9f985db9d97` 为 done。真实模型按需进行了两次搜索、三次网页读取，最终中文答案含两个接口、价格、有效请求条件和官方链接；Fetch 来源持久化到工具进度，五笔检索费用分别记账。
- 首轮直接接口测试曾因 Markdown 把 `/` 写成 `\/` 而断言失败；正文存在、费用正确。仅在测试断言中处理 Markdown 斜杠转义，产品保留原始正文，未改写来源内容。
- 随后重跑曾遇本机 `getaddrinfo ENOTFOUND api.deepseek.com`；与首次成功回执分别记录，不将网络失败计为通过。代理复跑结果见下方最终结果。

### 最终复跑

测试进程启用 `PROXY_ENABLED=true`、`PROXY_URL=http://127.0.0.1:7890` 后，整文件 **3/3 通过**：两项真实链路、一项 mock HTTP + 真实 PG 回归。未修改系统或项目代理设置。

- 直接接口任务 `18c8a415-978e-4627-b6ea-41f6414bade3`：Search 返回三条官方来源并提供正文，Fetch 返回 10,282 字符。原文端点断言、账本成本/额度/快照与无伪造 LLM token 事件断言全部通过。
- 完整 Agent 任务 `ddc62bb1-8a0b-46c5-a117-30b2ead9081f`：真实搜索和原文读取、接口与价格回答、引用持久化、按次成本断言全部通过。
- 原始成功与中间失败记录保留：`/tmp/hirelix-web-retrieval-real-20261020.log`、`/tmp/hirelix-web-retrieval-final-real-20261020.log`。最终三项结果为 `/tmp/hirelix-web-retrieval-proxy-real-20261020.log`。这些日志不提交 Git。

### Mock 回归与本地数据库

`workspace-web-search.test.ts` 覆盖结构化来源、URL 去重和协议、摘要/正文区分、Unicode 与结果数边界、截断、真实请求路径与载荷的 mock 检查、取消、暂时错误重试和鉴权/连接错误。

`workspace-web-retrieval.test.ts` 的 mock HTTP + 真实 PostgreSQL 分支验证：空搜索、空正文、403 和错误响应结构后，检索消耗与成本均为零。该分支只证明错误路径和账本行为，不代替真实供应商验收。

全量单元回归：472 通过、9 跳过、0 失败。类型检查和变更文件 ESLint 通过；最终定向回归 10 项通过。

## 边界

本轮通过真实 Agent runtime、工具和数据库执行；未重新进行独立网页/worker 浏览器验收，没有验证生产部署。Fetch 不保证绕过登录、付费墙或 LinkedIn 限制，不能把无结果解释为某个主页必然私有。正文返回与具体事实得到充分证明是两个层次。

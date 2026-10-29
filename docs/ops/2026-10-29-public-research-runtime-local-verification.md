# 公开研究 Runtime 三项修正与本地真实验收

2026-10-29。仅修改和验证本地，未推送或部署。生产问题基线见 [生产检查报告](2026-10-29-production-product-review.md)。

## 结论

同一自然请求、59.26 credits 起始余额的主验收完整交付，两位人选为 Paul A. Jungwirth 和 Peter Geoghegan，包含相关工作证据、来源、公开邮箱及不确定性。任务一次完成，不需要 Continue。补充的真实停止/续办测试证明此前研究观察进入恢复请求并最终生成交付，但该次名单有地域匹配缺口，不能把两次任务 done 都记为业务质量全通过。

## 修正及归属

- `web-search.ts` 保留服务实际返回的完整摘要和正文；`web-observations.ts` 将完整工具观察保存到现有、按用户隔离的文件存储。给模型的 Search 视图保留标题、URL、summary、日期和评分信号，展示用 snippet 留在完整观察中；summary 每条最多 4,000 字符、每次合计 24,000 字符。Search 可选正文合计及 Fetch 首段分别最多 12,000 字符，遗漏内容明确标识并附原文引用。原始观察、时间、来源不因窗口限制被丢弃。
- 复用 `read_file` 的 file_id/offset 读取，增加 limit 参数（原默认 100,000 保持不变）；引用提供 12,000 字符分页参数。读取已保存的原文不重新 Fetch，也不再次收取该 URL 的检索请求费用。保留 Search 的默认 `need_content=false`，需要正文时仍可显式请求。
- `agent-model.ts` 用官方 V4 tokenizer 对 prompt 和工具 schema 的 JSON 计数，预留 20% + 512 tokens 协议余量，代替把 UTF-8 字节直接当 tokens。仍按保守输入单价预留，仍由实际 provider usage 结算；并发逐调用预留、租约和额度上限不变。OpenRouter 保留原有字节上界。计数估算进入结构化 usage metadata，不记录生产提示词。
- 每次已完成的网页观察在有效 job lease 内保存到 `job.result.web_observations`；继续或重试时把观察及其原文引用交回模型，恢复引用来源。没有把 UI 的链接列表当作完整研究证据，也没有引入新表或通用 checkpoint 服务。
- 工具内部的 `AgentCreditError`/资源暂停向 runtime 传递，不再包装成普通 502；输出长度暂停在记录供应商用量和任务成本后执行，保留现有暂停任务退还用户额度的规则。

没有更换模型或搜索供应商，没有修改 recruiting Skill、系统业务指导、候选人判断或调用次序，没有规定搜索次数。官方 tokenizer 资产约 6.37 MB，依赖 `@huggingface/tokenizers@0.2.0`；资产来源、校验和及许可见 `src/assets/tokenizers/`。构建确认 conversation API 的文件追踪包含该资产。

## 本地真实链路

Web 和独立 Agent worker 均连接 `127.0.0.1:5432/hirelix_workspace_qa_isolated_web_real_20261029`。数据库由现有本地 QA 的纯 schema 建立，未复制生产候选人资料。主场景复用已授权本地 QA 身份；起始额度用标明 QA fixture 的历史消耗记录设为 59.26，不修改生产权益。独立契约测试使用 `hirelix_workspace_qa_isolated_web_contract_20261029`。

自然请求逐字复用生产原任务：

> Find two potential candidates for a Staff PostgreSQL Engineer role at a fictional US/Canada remote database company. The role needs hands-on PostgreSQL internals, query optimization and extension development. Use public web sources only. For each person, explain the supporting evidence with source links, state current role and location only if verified, and include a public contact route if one is available. Do not assume current availability. Do not use my private library, save profiles, or contact anyone.

### 主验收：一次完整交付

- Chrome 可见页面提交；QA owner `2894d618-f523-4192-aabd-825b1d96a9df`，conversation `dbc8fe50-58ed-4baa-8fe1-01dc04f36548`，job `aebda320-bc3e-47de-86f6-6d5e1537f50c`。
- 起始 59.26 credits；15 个完成模型轮次，18 次 Search、8 次 Fetch；约 269.92 秒（含排队），status=done。全程没有 Continue 或补充要求。
- 消耗 23.8167 credits，结束余额 35.4433，页面显示 35.44。最大实际模型输入 117,009 tokens；全部完成调用的估算预留均覆盖实际输入用量，最终 call_reservations 为空。
- 交付两位公开资料显示位于美国的人选，分别有岗位相关证据、来源与待核实项；公开邮箱 `pj@illuminatedcomputing.com` 和 `pg@bowt.ie` 均能在模型实际收到的工具证据中找到，不是仅在事后网页中搜索到。公开发表不等于邮箱可投递，未发测试邮件。
- 正文引用包含 11 个不同 URL；其中 3 个 GitHub 链接来自已观察文本内部，而非 Search 的顶层 sources 列表。未据此宣称这些链接目标都经过 Fetch。当前角色的自报/历史会议职称边界在交付中说明，未核实求职意愿或工作许可。
- 候选人、职位、业务记录均为 0，工具没有保存人选或联系任何人。Chrome 回读名单、余额和实际排版，截图保留在本机证据目录。

### 真实停止/续办：工程通过，名单质量有缺口

- 独立 QA owner `630660d6-2c0b-4759-930a-8c5c629aae4a` 同样起始 59.26 credits；conversation `d31617a7-258e-4370-b593-3221b657f170`，job `1c1cd43b-d2ef-4d00-9978-cda7b1bb7583`。
- 通过真实消息服务创建任务，由同一真实 worker 执行；前两次 Search 保存后，经真实 controlConversation 服务手动停止、再继续。这是业务控制服务与真实模型验收，不是第二次浏览器点击验收。
- 恢复后的首个真实 API 请求包含停止前 2 个观察的全部 20 条来源 URL 和 summary。模型没有重做停止前的两条查询。此前观察可以利用，不等同于禁止模型主动重新核验。
- 最终 done，合计 15 个完成轮次、12 次 Search 和 11 次 Fetch，约 244.42 秒。最终用户账本为 17.7175 credits、余额 41.5425；暂停前尝试另存快照，不能把最终重置后的账本当作全部供应商成本。
- 交付为 Andrei Lepikhov 与 Melanie Plageman，提供公开联系入口并明确可用性未知。前者来源所在地为 Madrid，后者所在地未核实；这不是已核验的 US/Canada 人选组合。工程恢复契约通过，业务结果应记为有明确缺口的研究交付，未增加案例专用规则掩盖此差异。

## 原文、计数与回归

- 实际 Fetch 的 PostgreSQL 18 release notes（41,473 字符）和 amcheck commit（24,605 字符），首段进入模型的各为 12,000 字符；完整持久文件与保留的原始观察逐字相同，尾部文本通过现有读取服务核对一致。自然主任务未自行读取这些尾页，不能把服务回读验证描述成模型已经读完全部原文。
- 官方真实 API 校准包含完整 37 项工具定义，英文、长英文、中文三组输入：实际 20,381 / 24,132 / 23,131 tokens，对应预留 21,718 / 26,219 / 25,018；主验收和真实续办中的全部成功模型调用也在预留之内。20% + 512 是当前协议的已测余量，不是对任意未来模型或模板的数学保证。
- `npm run test:unit`：528 项，508 通过、20 项需独立条件而跳过。
- 真实本地 PostgreSQL + 受控模型/transport：runtime recovery 9/9，覆盖超过 20 轮、正文分页、观察恢复、文件归属隔离、工具额度暂停和原有写入回执恢复；并发计费/telemetry 4/4，包含长度暂停的成本记录与预留释放。
- `npm run build`、`npx tsc --noEmit`、全仓 ESLint 与 `git diff --check` 通过。未重测整站支付、邮件、导入和生产流程；本地通过不代表生产放行。

## 证据与边界

本机忽略目录 `output/web-runtime-local-20261029/` 保存：`main-evidence.json`、`main-verification.json`、`original-readback-verification.json`、`resume-before.json`、`resume-final.json`、`resume-context-verification.json`、`resume-verification.json`、校准结果、测试/构建日志及 Chrome 截图。QA-only 透明 transport 观察真实 provider 请求与返回，不保存请求头或凭据，不复制其他用户资料。

修正不能补回旧生产任务从未保存的研究观察；此次验收是在新建本地隔离任务中完成。单次主场景成功未证明名单质量稳定、搜索次数最优或任意余额下都能完成；真实续办场景已暴露的地域匹配缺口保留为模型表现观察。

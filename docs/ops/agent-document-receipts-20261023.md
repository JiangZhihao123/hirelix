# 文稿保存回执精简与真实验证

2026-10-23；本地隔离库 `hirelix_workspace_qa_local_20261022`；未推送或部署。执行连续性修复及正常停止证据见[执行恢复验证](agent-execution-recovery-20261023.md)。

## 修改归属与保留信息

`agent-tools.ts/edit_document` 原来通过 `documentSource()` 把完整正文和 `source_snapshot` 再返回模型。现在只投影保存状态、文稿 id/title/kind/status/version/href/word count、精确执行的 replacement、已校验的来源选择及实际 record/file IDs、捕获时间。replacement 来自通过精确文本匹配和事务提交的编辑，不以一句“saved”替代结果。

`read_document` 继续按需返回完整正文、来源快照、历史摘要和交付状态。底层 `editDocument()`、乐观版本、来源归属/版本、幂等回执、UI 的 document_edits metadata 和完整版本快照均保持原契约。未改成固定工具顺序或禁止读回。

真实 PG 工具契约 `tests/integration/workspace-document-receipt.test.ts` 通过：精简回执包含局部编辑/来源引用；完整正文和来源可读回；原文与新版完整存入 versions；重复相同保存参数只返回原回执、版本不再次增加；UI 仍有保存文稿入口。

## Chrome → Next.js → worker → DeepSeek → PG 自然场景

网页与独立 worker 使用同一隔离库，沿用 Chrome 现有登录态。从原文稿 v1 冻结副本创建 QA 文稿 `b8543b7e-1ca5-4cd8-ac75-fb569c481dd9`，原文稿 `795a3fad-2d3c-43e0-a1f9-3577f0255fab` 保持 v2。原指令比较 Taylor Reed / Quinn Hart 对 Harborlight 当前职位的适配、保存内部报告，禁止发送、发布或更改候选人/职位。

真实 job `159d148d-453e-46d5-978d-17db8a8e50f9`，execution `c50d8c1b-ff05-4208-a17b-79971b4dbd8d`，一次 attempt、8 steps，保存 v2 与 v3 并完成回答。失败/读回必须保留在结论中：

- 首次 edit 返回 400，原因是模型选入另一 client role 的来源笔记；服务正确拒绝，未产生版本。模型移除该 ID 后成功。该错误与保存回执缺字段无关。
- v2 的五处局部替换更新证据基础、比较结论、Quinn 管理范围、notice 和薪资来源；随后 read_document 读回 v2，再对 Taylor 的客户范围授权、Quinn 的管理经历/IC 意愿比较做两处不同的替换，形成 v3。
- 第二次 read_document 的返回版本和内容已变化，并引出了不同修改，不能按同名工具直接判定为空转。也不能由该样本断言精简回执降低了总调用数或整体 token；没有控制其他上下文和模型选择。

后续自然重写 job `dd244f83-0d34-4508-8162-f04f73b89e95` 也一次完成，但模型首次 revise 参数超过既有限制，随后自行选择 edit 并读回，形成 v4/v5。此样本保留，未为了得到特定工具路径重复诱导 prompt。独立 drain 验证直接调用真实 revision 服务，另形成一次 v6。

## 同一保存结果的体积核对

使用本次真实保存版本重建**旧工具的同一结果投影**，与实际持久回执比较（JSON UTF-8 bytes，不是 token，也不是模型整轮输入）：

| 保存版本 | 旧完整结果投影 | 新实际回执 | 降幅 |
| --- | ---: | ---: | ---: |
| v2，5处替换 | 19,256 | 3,283 | 82.95% |
| v3，2处替换 | 19,395 | 1,617 | 91.66% |

完整来源快照在 v2/v3 均为 11,057 bytes，正文分别为 7,135 / 7,274 bytes，完整存储。若替换整篇正文，replacement 自身可能较大：后续 v4 为 6,148 bytes，因此不宣称所有编辑回执都有同一降幅。

最后真实 revision 只新增一次 v6；源快照、7 条记录和 2 人保持不变，Chrome 刷新后可见 v1–v6 全部历史。数据核对未发现本轮另写候选人、职位或来源记录。临时本地额度 fixture 已按原值恢复；没有调整生产额度或数据。

工程结论是：**保存时自动重复返回完整正文/来源的载荷已消除，完整证据与按需读回保留。** 自然模型仍可能纠错、读回或做后续不同编辑；本轮没有证明所有模型调用都无重复劳动，不为追求调用数而禁止必要验证。

本地证据位于 `tmp/execution-receipts-20261023/`：`real-edit.json`、`audit.json`、`transport/`、`final-integrity.json`、`chrome-final-history.png`。其中请求体只用于虚构 QA 资料验收，不进入 Git 或生产日志。

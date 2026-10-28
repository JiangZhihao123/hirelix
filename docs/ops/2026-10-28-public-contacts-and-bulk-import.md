# 公开联系方式与 120 人导入补验

日期：2026-10-28；沿用生产隔离 QA owner `6fb18e39-b4a9-4c7f-bc65-02bc709fdac1`。用户追问联系方式交付，并要求把 SaaS 导入人数提高到 100 以上。本轮只运行验收、记录结果，没有修改产品代码、push、部署、付费、发邮件或联系候选人。

**结论：产品已补交 5 个有公开来源的邮箱；120 位虚构人选及 120 条原始备注真实入库，资料字段核对通过。首次任务触发 20 步执行上限，点击 Continue 后完成；49 条重叠导出来源中 48 条声明行号与实际 CSV 位置不符。不能称首次完整冷启动通过，也没有完成真实 SaaS 原始导出 100+ 人的验收。**

## 联系方式实际交付

前轮五人名单没有交付邮箱或电话，本轮向同一正式 Agent 会话自然追问公开工作联系信息，要求来源、区分新旧，不猜地址、不入库、不联系人。

- conversation `fb85beb4-3a8b-41de-a211-63c439c863b9`；job `ed058b55-dcce-4282-ab9d-2e37401b9db9`，done，约 203 秒。
- 实际 11 次 `web_search`、22 次 `web_fetch`，其中 4 次抓取失败；没有用私人候选人库检索或保存工具。
- 回读前后 people、roles、records、files、documents、versions、embeddings 和副作用计数完全相同。最终账本 21.3734 credits，预留调用已结清。

| 人选 | 实际交付邮箱 | 验收者独立核验的公开原始来源 | 交付边界 |
| --- | --- | --- | --- |
| Stu Hood | `stuhood@paradedb.com` | [ParadeDB 提交元数据](https://api.github.com/repos/paradedb/paradedb/commits/e45148344e5bf1f0bb7b2b77278b9ca201c748b1) | author name/email 对应，时间 `2026-10-27T22:30:06Z`，verification 为 valid；这是公开技术工作中的雇主邮箱 |
| John Pruitt | `jgpruitt@gmail.com` | [本人公开提交元数据](https://api.github.com/repos/timescale/memory-engine/commits/3d0f3ad30987b04a98d7584ad058dc7a623b702c) | author/committer name/email 对应，时间 `2026-10-27T22:07:29Z`；提交未签名，且并非公开招呼联系的地址，Agent 也明确说明 |
| Jeremy Schneider | `schneider@ardentperf.com` | [本人 PGXN 资料](https://pgxn.org/user/jeremy) | 资料中直接列出的 Email 字段，与本人网站关联 |
| Andrew Kane | `andrew@ankane.org` | [本人维护项目的 gemspec](https://raw.githubusercontent.com/pgvector/pgvector-ruby/master/pgvector.gemspec) | author 为 Andrew Kane，email 字段对应；没有把个人主页没有展示邮箱误称为主页公开联系入口 |
| Robert Haas | `robertmhaas@gmail.com` | [本人 2026-04-06 PostgreSQL 邮件列表帖子](https://www.postgresql.org/message-id/CA%2BTgmobSqZZ6NaEw7BvoLUsTAsbTiUPuiZF3%3DqUfkTBwDzOnOA%40mail.gmail.com) | From 对应姓名和邮箱；是本人公开用于技术社区的个人邮箱，不是公司邮箱 |

这证明公开地址有来源且归属有依据，**不证明当前邮箱有效、可投递、本人接受招聘联系或已同意接触**。没有做 SMTP 探测、发送验证邮件或真实触达。没有交付电话；产品明确将其限定为“本轮所查来源没有找到”，不代表电话不存在。没有把这些公开人物另存进候选人库。前轮人物经历归属错误也没有因这次补联系方式而被追溯判成正确。

## SaaS 实际准备及人数限制

1. 使用此前获准的 Recruit CRM 试用账号及既有登录态。最初仅有 William Sample 官方示例人选；没有读取其他真实猎头资料。
2. 从 SaaS 导入面板实际取得[官方 CSV 模板](https://rcrm-websiteassetsimage-ap-south-1.s3.ap-south-1.amazonaws.com/samplecsvdata/sample_candidate_csv.csv)，按其 26 列制作 120 人虚构数据。通过表格工具生成并核对 CSV；姓名、邮箱均唯一，含 4 类职位、6 个城市、12 个空电话、18 个空经验值、120 条无日期备注，其中 8 条包含换行。邮箱全部使用 `example.test`，电话使用虚构测试号码，不是真实候选人资料。
3. 经 Recruit CRM 正常系统文件选择器上传，并在其原生导入界面映射 15 个非空字段；不合并、不新增 hotlist、不触发邮件或采购。实际只新增首 49 人，总人数停在 50。
4. [官方 FAQ](https://help.recruitcrm.io/en/articles/8143488-faq-handbook)明确试用账号最多 50 位候选人，导入也受限，删除不恢复额度。没有充值、升级或绕过限制。**无法从此试用账号取得含 100+ 位候选人的真实原始导出。**
5. 正常全选 50 人并导出全部字段，下载真实的 `Candidates_2026_28_10_3_34_47.csv`，复制留档时未修改字节：50 个数据行、51 列、23,506 字节，SHA-256 `93231f2f6291975e64c79f5ac77f6b08ebc32a6d8f96d577d69e007c022d47cf`。原导出仍有重复中文姓名/国家表头；包含姓名、联系方式、技能、薪资等，但没有备注正文列。

本轮的 100+ 压力输入是**真实 SaaS 50 行导出 + 120 行官方模板虚构 seed CSV**。两者 49 人重叠，合计 121 个不同的人，其中 William 已在 QA 库。没有把追加生成的 71 人伪称为 SaaS 实际导出，也没有把 120 条 seed 备注说成从 SaaS 导出恢复。

seed CSV 为 54,310 字节，SHA-256 `5a502bdd2829470d8e464ddf5ebf2a82115c47a55ac6b54d7d6e48ff9d75dea7`。原始 50 行导出与原 seed 两份文件直接交给 Hirelix，没有转成 Hirelix 模板，也没有向 Agent 指定工具、批次划分或映射代码。

## 生产 120 人导入结果

conversation `576ea050-2cc0-443f-b86c-3a965b06fa22`；chat job `3bc92628-de0e-4fe4-bf9c-b16cd8b8f8da`。自然委托要求导入两份文件中的人选与可用备注，匹配重叠，保留来源，报告保存/重复/未解决数量，保持既有人选不变、不联系人。

| 验收项 | 数据库及真实 UI 结果 |
| --- | --- |
| 新人选完整性 | 120/120 恰好各一人；无缺人、重复人，库从 9 人增至 129 人 |
| 核心字段 | 120/120 姓名、职位、城市、电话和技能与 seed 一致；邮箱逐人唯一对应。12 个缺失电话保持空；有值电话的 `+` 保留 |
| 原始备注 | 120/120 正文逐字一致，包括 8 条多行备注；全部 `occurred_on=null`，未猜测沟通日期。另有自动 provenance note，不把它们计作新增原始备注 |
| 两份输入 | 数据库实际 bytes 的 SHA、存储摘要和本地输入三者一致；后续全部存储文件摘要也一致 |
| 重叠及既有资料 | 49 个重叠输入未创建第二个人；William 没有被重建或改写档案，仅新增此次导出的一条来源摘要。原 9 人、既有职位、记录、文件、文档及版本逐项未变 |
| 批量回执 | 3 个 import jobs 分别 applied=120、120、49；conflict/failed/unprocessed 均为 0。William 的第 50 条导出来源使用单条 save_record 保存 |
| 页面尾部数据 | Chrome 真实列表显示 129 人；按 `saas120.person120@example.test` 搜索返回唯一人选，打开 QA Reese BatchEP，看到 Finance Director / Austin、正确邮箱电话，以及第 120 条原始备注 |
| 索引 | 120/120 新人选均有真实 embedding；本轮 166 个索引任务全部 done，最终共 576 个向量片段。索引存在不等于召回排序质量通过 |
| 副作用 | emails/shares/schedules/role_candidates 均为 0；没有发送、分享、建立职位关系或更改真实候选人 |

最终 129 人、1 职位、444 条记录、29 个文件、1 份既有文档、585 条版本记录。相对本轮开始新增 120 人、410 条记录（120 条自动 profile source、120 条 provenance note、120 条原始 seed note、50 条导出来源摘要），不是 410 条原始沟通。没有逐字段核验所有薪资/币种等结构化 profile 内容，也没有验证 120 份原始简历解析；本轮主要输入是候选人表。

## 未通过项：执行上限与来源行号

### 首次执行不能完整交付

- `src/lib/workspace/agent-runtime.ts` 当前配置 `stepCountIs(20)`。首轮已提交并完成 3 个批次，但没有在 20 轮内形成完整最终回答，UI 明确显示执行上限错误及 Continue/Retry。
- 保留首轮错误页后，实际点击 Continue。同一 job 的 `payload.resuming=true`，保留两次 execution_id、第一轮 20 步和第二轮 6 步；最终 done，没有重新创建已保存的人选、原始备注或批次。
- 续办只额外保存了原来尚未保存的 William 本次导出来源摘要，然后交付最终数量。总计约 253 秒（从首次 job 创建至续办结束，含人工操作间隔），不是首次自主运行耗时。
- **因此持久化与 Continue 恢复通过，首次完整体验未通过。** 没有为该案例提高步数、写固定导入工作流或隐去原始失败。

### 声明来源行号错位

- `declared_source.row` 的契约是声明的一基源行位置，和 `normalized_line` 分开保存。49 条批量导出来源记录的行号沿用了 seed 次序，但原 SaaS CSV 按相反次序输出。
- 例如 `saas120.person009@example.test` 在真实导出为第 41 个数据行，却声明 row=9；`saas120.person044@example.test` 在第 6 个数据行，却声明 row=44。不是简单的表头加一差异。
- 按数据行计，49 条中仅 1 条恰好指到正确位置，48 条错位；即使按包含表头的行号解释也无法成立。人选邮箱和实际保存的导出摘要仍对应正确人，未发现跨人关联；两份原 CSV 完整保留。
- 源行声明由 Agent 生成，当前服务保证文件归属、规范化输入和回执持久性，不保证任意声明与原文语义一致。**不能把已保留原件宣传成所有来源定位都准确，也不能把本次错误直接当成已定位的工程丢失信息。** 本轮记录为来源质量失败，没有添加平台专用解析、案例分支或补提示词。
- 产品最终文字称 50 条导出行“verbatim”；实际保存的是可读字段摘要，并非逐字保留 51 列及所有空列的完整行。完整原始数据在 CSV 原件中；该措辞同样不能作为精确转录证明。

## 结束状态与证据

- 本轮新增 2 个 chat、3 个 import、166 个 index jobs 均 done；该 owner 累计 207 个任务中 206 done、1 个前轮 cancelled，无 queued/running/error 或活跃租约。
- 结束时生产服务器仍为 `8821591df64665fb62920a2c839467b39b868906`、工作树干净，scheduler/PostgreSQL active；按该批量 chat job 的准确标签查询，Docker 容器及卷无残留，没有检查或清理其他工作负载。
- 最终两项账本分别为 21.3734 / 12.7405 credits，均 `consumed_units=reserved_units`、`call_reservations={}`。这些是结束时产品账本读数；包含出错/续办的任务不能据此推算整个过程中所有供应商调用的总成本。
- 全程仅对 QA owner 的业务表做只读回读。原生 Chrome 恢复连接时曾自动返回当时非测试页的内容，未用于本轮分析或另存；此后加入测试页/地址栏核对，仅操作 Hirelix 与 Recruit CRM。独立窗口尝试仍会受到原生工具当前窗口选择影响，最终使用可确认的既有测试标签完成；没有把浏览器切换错误归给产品。
- 本机忽略目录 `output/saas-120-20261028/` 保留原始模板与 seed、未改字节的真实 50 行导出、基线/中间/最终 owner 快照、`verify-import.py`、逐人比较、`export-source-row-check.json`、公开邮箱原始元数据、UI AX 与截图。重点截图为 `public-contacts.png`、`bulk-execution-limit.png`、`bulk-final.png`、`tail-candidate.png`。
- 本轮未修改产品代码，因此不重新跑构建/单测；文档改动单独本地提交。未验证真实 SaaS 100+ 原始导出、其他平台、真实触达、更多附件/扫描件、大规模并发及首次完全自主交付。

前轮范围与结果见[冷启动核心验收](2026-10-28-cold-start-core-verification.md)。

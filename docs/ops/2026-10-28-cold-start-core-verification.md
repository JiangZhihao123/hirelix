# 冷启动核心验收：原始资料导入与 JD 公开寻访

日期：2026-10-28。按用户明确的两项首用能力，在 `hirelix.online` 通过真实 Chrome、正式 Agent、真实模型与数据库运行；本轮没有修改产品代码、push 或部署。生产服务器仍为 `8821591df64665fb62920a2c839467b39b868906`。

**结论：小样本的原始资料导入、原件保留、备注关联及跨会话使用已跑通；JD 公开寻访真实执行并交付 5 人及来源，但原文抽查发现人物经历归属错误，不能判为业务质量完整通过。两项冷启动能力尚不构成大规模迁移、稳定首次体验或正式上线放行。**

后续按用户要求补查了公开联系方式，并将候选人表验收提高到 120 位虚构人选，见[联系方式与批量补验](2026-10-28-public-contacts-and-bulk-import.md)。120 人及原始备注保存、去重和核心字段核对通过，但首轮触发 20 步上限、Continue 后才完成，且发现 48 条导出来源声明行号错位；真实 SaaS 导出因试用上限只取得 50 人，不能称原始 SaaS 100+ 人完整通过。

## 条件与范围

- 全部业务操作使用前轮专用 QA owner `6fb18e39-b4a9-4c7f-bc65-02bc709fdac1`。本轮开始已有 4 位虚构人选、1 个虚构职位等前轮测试沉淀；没有重新创建空账号。因此这是首次处理本轮新资料及独立公开研究的验收，不是重新注册后零历史状态的完整首用验收。
- 不连接或读取真实猎头的私人资料。本地文件夹完全虚构；Recruit CRM 输入是此前正式试用界面取得的原始导出，但只含平台的 1 位官方示例人选。公开研究只研究公开人物，不使用私人库；导入去重与后续使用仅在该 QA 库中发生。
- 用户通过普通自然语言交代目标并上传原始文件，没有提供 Hirelix 模板、字段映射、工具名称、调用顺序或预设人选结论。平台导出未重写；本地 CV 未改字节，只按常见文件夹结构打包并加入两条虚构沟通记录。
- 浏览器插件不可用，使用原生 Chrome 的可见页面和系统文件选择器；原生 AX 点击遇到失效元素或无 frame 后，依据截图改为坐标点击，成功打开结果中的人选详情。没有用数据库直接写入或直接调用业务服务替代 Agent。
- 数据库审计使用 owner 限定条件和只读事务，回读记录、关联、版本、原件 SHA、任务与账本。没有查看其他 owner 的候选人、文件或消息；不是跨账号渗透测试。

## 实际场景与结果

| 场景 | 输入及用户委托 | 真实结果 | 判定与限制 |
| --- | --- | --- | --- |
| 从本地电脑带入简历库 | 一个普通 ZIP，4 份 PDF/DOCX 简历分布在年份/职能子目录，另有 2 条 TXT 沟通记录；要求整理入库、保留原件、可靠关联备注、保持其他记录不变 | 新建 4 人、4 条 CV、2 条来源备注；6 个解出文件的字节、SHA 和原路径全部匹配。Morgan 备注保留 `2026-09-30`；Maya 备注无日期，保持 null。Chrome 实际打开 Maya 档案并展开 CV 原文及会议记录；旧记录逐项不变 | **小样本导入与关联通过，过程中有错误并自动恢复。** 仅虚构材料，未证明真实历史库规模、重复导入或任意复杂文件夹均可靠 |
| 从常用 SaaS 原始导出带入 | Recruit CRM 原始 51 列 CSV + 原始附件 ZIP；重复中文表头、空字段、无扩展名 PDF；要求导入人选、可用备注和原 CV，报告缺口 | William Sample 正确入库，保留完整原始 CSV 行和原件；PDF 按平台 ID 路径及姓名/邮箱关联。CSV、ZIP、独立 PDF 的数据库原字节 SHA 与本地一致；原 4 人未变 | **此真实导出格式的小样本通过。** 只有官方示例 1 人；导出没有备注正文，只含最后备注时间，Agent 明确报告缺失；不能称完整 ATS 备份迁移通过 |
| 导入后可继续招聘工作 | 另开对话，不再附文件或给人名；给 B2B 物流 Head of Product 简报，要求按刚导入 CV 和备注分析、不写入、不联网 | 真实读取库和 Maya/Morgan 的完整资料及备注，给出比较和待核实项；用到了 Maya 备注中“4 位直接汇报”的信息；识别 Morgan 摘要与 CV 任职日期冲突。分析后业务表、版本、原件和向量均与导入后完全一致 | **跨会话取得并使用已导入资料通过。** 本次走候选人列表与详情读取，不据此声称语义向量召回质量通过；人选建议属于模型表现观察 |
| 根据 JD 从公开网络找人 | Staff Database Engineer；远程 US/Canada；PostgreSQL 查询优化、数据库内部机制，向量/扩展加分；要求 5 人及证据缺口；禁止用私人库、保存或联系 | 完成 14 次搜索、10 次抓取（8 成功、2 返回 502）；约 183 秒交付 Stu Hood、John Pruitt、Jeremy Schneider、Andrew Kane、Robert Haas，带公开来源、匹配理由及未知项。业务对象、文件、版本和索引与开始前完全相同，未调用私人库检索、保存、发送或分享工具 | **真实公开研究链路通过，业务质量未完整通过。** 抽查发现把 Mat Arye 的压缩开发经历归给 John Pruitt；至少一人的当前 US/Canada 所在地未核实。多位为负责人或知名维护者，可接触性未知；不是 5 位已核实可招聘候选人 |

## 输入原件与关联核对

### 原始 Recruit CRM 导出

- `recruit-crm-candidates-with-note.csv`：1,295 字节，SHA-256 `69abce420a821adf20ad7d52f014ae4bc4833eef4145d9338663b619eb06e5e3`。
- `recruit-crm-attachments.zip`：46,869 字节，SHA-256 `a8a512767fdae2f47b52f699bfc7c5730bda5f662bb0af98774fb9e69cdebd09`。
- 唯一附件 `Candidates/17930944138200161685xdU/0_no_name_`：46,665 字节，无文件扩展名、签名 `%PDF-1.4`，SHA-256 `e10e4ac1a5717ee1a9c69124f300efb05b7c0d574e0f227b45b54c562f27da90`。数据库登记为 William 的 CV；三者均比较了数据库实际 bytes 的摘要，不只比较存储的 SHA 字段。
- 51 列原始行保存在自动来源记录，另外保存可读摘要及 CV 记录；不是将摘要当成完整原始导出。人选字段中的姓名、邮箱、技能、城市与原行匹配，经历/教育来自 PDF。
- `最后添加的注释` 只有 `Oct 27, 2026, 6:59 PM`，不是备注正文。最终没有伪造笔记；CSV 电话与 PDF 电话冲突、薪资缺币种、街道/城市字段不齐均在交付中说明。原文的 opt-out=No 未转换成联系或分享授权。
- 人选 `7560750b-2914-49ba-a896-8d84f5ab4d8d`，CV 记录 `fca760bf-f6b1-4f77-b540-830e097b9d43`。

### 本地混合文件夹

`local-resume-folder.zip`：39,886 字节，SHA-256 `f00c8f788fc0d7d885e7800cc0bd052b147d48bf61650386cbfbf5ed14805301`。以下每项恰好对应一条原件来源记录；解出文件全部匹配归档原字节，备注正文与源 TXT 逐字一致（忽略结尾换行）。

| 归档路径 | 关联人选 | 记录种类与日期 |
| --- | --- | --- |
| `2025/finance/Taylor Park.docx` | Taylor Park | CV；不猜测日期 |
| `2025/product/Morgan Reed.pdf` | Morgan Reed | CV；不猜测日期 |
| `2026/product/Maya Chen CV.pdf` | Maya Chen | CV；不猜测日期 |
| `2026/data/Owen Patel.pdf` | Owen Patel | CV；不猜测日期 |
| `notes/2026-09-30 Morgan call.txt` | Morgan Reed | call，`occurred_on=2026-09-30` |
| `notes/Maya meeting notes.txt` | Maya Chen | note，`occurred_on=null` |

工具实际读取了归档中 6 项内容；原件、来源路径和记录中的 person_id 一一核对。新建人选和附加记录还自动产生了 profile/recruiter-note 来源：本地导入共增加 14 条记录，不是 14 条原始笔记。自动 profile source 保存的是 ZIP 清单，不能把清单内容称为简历正文；4 条 CV 记录另存完整抽取文本及对应原件。

导入生成的 Morgan profile summary 写了“since 2021”，而其 experience 字段及 CV 为 `2021–2025`。这是本次观察到的模型摘要事实偏移；原文保持正确，后续独立分析也指出冲突，但不能据此称结构化资料抽取完全准确。

## 公开寻访原文抽查

这些是验收者对交付引用的独立核验，不替代 Agent 的原始执行。没有把搜索摘要、链接存在或页面所属项目的能力，当作某个人亲自完成该工作的充分证明。

| 人选 | 本轮实际打开的第一方或原始来源 | 支持与缺口 |
| --- | --- | --- |
| Stu Hood | [PGConf.dev 人物介绍](https://www.pgevents.ca/events/pgconfdev2026/schedule/speaker/324-stu-hood/)、[2026 技术演讲](https://2026.pgconf.dev/session/682) | 支持 ParadeDB 工程负责人及 PostgreSQL 索引/Custom Scan 相关技术工作；会议页不单独证明当前居住地或 IC 求职意向 |
| John Pruitt | [2024-06-14 Postgres FM 访谈原文](https://postgres.fm/episodes/pgvectorscale/transcript)、[FOSDEM 2022 人物介绍](https://archive.fosdem.org/2022/schedule/speaker/john_pruitt/) | 支持参与 pgvectorscale 访谈及历史 Timescale/Shipt 经历；**访谈中谈自己做过 Timescale 压缩的是 Mat，不是 John。** 交付把该经历归给 John，并用于后续匹配理由，原文不支持；2022/2024 资料也不能单独证明 2026 当前任职/所在地 |
| Jeremy Schneider | [2026-06-12 Talking Postgres](https://talkingpostgres.com/episodes/how-i-got-started-running-a-postgres-user-group-with-jeremy-schneider/)、[本人博客](https://ardentperf.com/)、[PostgreSQL 贡献者页](https://www.postgresql.org/community/contributors/) | 支持 PostgreSQL 工程师、Seattle 社群及公开性能诊断内容；没有因技术文章而证明 optimizer 源码贡献或当前跳槽意向。此次只打开访谈简介，未进一步读取音频/完整逐字稿去核实所有公司经历 |
| Andrew Kane | [本人 GitHub](https://github.com/ankane)、[PostgreSQL 贡献者页](https://www.postgresql.org/community/contributors/) | 支持旧交付所列公开项目、个人资料中的 San Francisco 和 significant contributor 身份；个人主页不证明当前可招聘性 |
| Robert Haas | [本人博客](https://rhaas.blogspot.com/)、[PostgreSQL 贡献者页](https://www.postgresql.org/community/contributors/) | 支持 Databricks Sr. Staff 身份与公开 PostgreSQL 工作；技术高度不能替代可接触性、意愿及目标职位适合性 |

未全量审计每个附加链接和每句技术断言，也未验证所有人选的最新雇主、居住地、联系方式、薪资、意愿或真实招聘可行性。没有发送联系消息，没有把公开人选保存入库，没有使用 Bright 或恢复独立付费寻访。

## 真实任务、耗时与恢复

耗时按 job 创建到最终更新时间，包含排队/执行/交付，不是基准测试。均由普通用户请求启动，没有预设应使用的工具或人选排序。

| 场景 | conversation / job | 状态 | 约耗时 | 计费 credits |
| --- | --- | --- | --- | --- |
| 公开寻访 | `fb85beb4-3a8b-41de-a211-63c439c863b9` / `b6cb5c10-afed-4ddc-b815-2447b9e083b5` | done | 183 秒 | 44.7370 |
| SaaS 导入 | `6809c224-83a6-4993-b4f1-87c20f3a2f72` / `63ddbd08-aade-407f-ac26-993d98baab54` | done | 75 秒 | 9.3981 |
| 本地文件夹导入 | `aef214c1-1d82-4cac-8392-7834aed8d77f` / `8bae08f9-4b07-4065-8a88-17cec929c931` | done | 106 秒 | 14.3234 |
| 跨会话使用 | `edc62529-6901-4538-b574-33fa0f8742d1` / `a109af34-4efb-4a33-9396-acb3869d5c13` | done | 30 秒 | 4.1855 |

- 公开抓取的两次 502 对用户可见，Agent 继续研究并交付；不是所有页面均读取成功。
- SaaS 导入的 `register_candidate_cv` 返回过一次 409，读取新版本后成功；末次 `save_record` 返回 400，最终未生成虚假备注。仅有事件码，不能把 400 的具体参数错误当成已定位根因。
- 本地导入的两次 `save_candidate` 返回 403，随后搜索相关人选并逐个重试成功；两次 CV 登记 409 在重读当前状态后成功。未放宽授权规则、未代替 Agent 补写。模型称 403 是 transient write-guard artifact，但**本轮没有取得每次失败的完整参数与错误正文，不能采信这一根因猜测，也不能称首次写入顺畅无误。**
- 本地导入的最终文字把“已有其他 7 人”说成了原有库数量；实际开始时有 5 人，另 2 人为本次稍早保存。数据库结果正确，但数量措辞不准确，保留为模型观察。

## 持久化、账本与结束状态

- 结束时该 owner 为 9 人、1 职位、34 条记录、18 个文件、1 份既有简报、55 条版本记录和 46 个向量片段。相对本轮开始新增 5 人、17 条记录、10 个文件、24 个向量片段；新资料的 12 个索引任务全部 done。
- 新增 4 个 chat jobs 全部 done，无租约。该 owner 的 36 个累计任务为 35 done、1 个前轮 cancelled，没有 queued/running/error。仅比较本 owner 的业务快照；公开研究和最后只读分析都未改变业务表，两个导入均未修改导入前已有的任何人选、职位、记录、原件、文档及版本。
- 所有存储文件的 `sha256` 与数据库实际 `bytes` 摘要一致；归档解出原件另与本地 ZIP entry 匹配。emails、shares、schedules、role_candidates 均为 0。
- 本轮 4 个 chat 合计 72.6440 credits，真实页面余额由 171.16 降为 98.52。四项均 `consumed_units=reserved_units`、`call_reservations={}`。前轮取消任务的历史预留不属于本轮扣费，不能直接汇总所有历史字段计算余额。
- 四项账本记录的可计费提供方成本合计 $0.2421343。该值不包含订阅内后台 embedding 成本、未记录为可计费模型调用的搜索等全部供应商账单，不作为全成本。
- 服务器 SHA 未变、工作树干净；scheduler/PostgreSQL active，NRestarts=0、ExecMainStatus=0。沙箱资源按本轮两个导入 job 的准确 `hirelix.agent.job` 标签核对，容器和卷均无残留；不检查或清理其他工作负载。
- 本轮没有改产品代码，不重新运行构建/单测；这些生产场景证据不覆盖整站回归。用户真实 ATS 大备份、其他 SaaS、重复导入、扫描/OCR、千人规模、批量中断恢复、全新账号首屏到第一次交付，以及真实猎头试用留存仍未验证。

原始输入清单、owner 限定只读审计脚本/快照、逐项 SHA/关联比较、完整 AX 与截图留在本机忽略目录 `output/coldstart-core-20261028/`，未提交原始导出、人物文件或凭据。主要证据为 `baseline.json`、`sourcing-result.json`、`saas-imported.json`、`local-imported.json`、`final.json`、`comparison.json`、`public-sourcing.png`、`saas-import.png`、`local-import.png`、`imported-candidate.png`、`import-reuse.png`。前轮其他特定验收见[隔离账号记录](2026-10-28-isolated-production-verification.md)。

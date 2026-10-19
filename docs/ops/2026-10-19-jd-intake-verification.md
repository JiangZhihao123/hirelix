# 收到 JD 后的本地真实链路测试

日期：2026-10-19（Asia/Shanghai）。代码基线：`e22febc9`。本次只测试、记录，不修改产品行为、不推送或部署。

## 环境与证据边界

- Chrome 现有登录态，`http://localhost:3000`，实际网页/worker 使用本机 PostgreSQL 隔离库 `hirelix_workspace_qa_release_20261019`。根据网页新建的对话、任务和最终数据库回执确认运行库，不能只根据 `.env.local` 推断：该文件当前指向另一个隔离库 `hirelix_workspace_qa_queue_20261015`。
- 使用真实 Agent 模型、业务工具、后台执行与 PostgreSQL；候选人与 JD 均为虚构 QA 材料。不是 mock 回归，也不证明真实人才库召回质量或生产可用性。
- 账号库里已有 Eva Martin、Leo Grant、Nina Cole 三人。未新增候选人，未启动退出产品的外部付费人才寻访，未发邮件。

## 场景一：只发来客户 JD

原话：“客户刚发来这份 JD：……这就是目前客户给我的资料。”JD 为 Fictional Harbor North QA1019 / Head of Product：物流 B2B SaaS、定价与套餐所有权、仓库异常流程、直属管理至少三位 PM、纽约每周三天到岗、底薪 18–21 万美元加股权、向 CEO 汇报。

- 对话：`e62c9813-7906-407a-bde5-90459c324162`。
- 任务：`2973dbf2-0da1-48e7-bca2-596ad740b88a`，`done`，约 101 秒。
- 职位：`1b84701f-10dd-4ba0-9bf5-bace5c24866b`。
- 实际执行：`save_role` → `find_candidates` / `list_candidates` → `list_roles` → `read_role` → 两次 `web_search` → 两次失败的 `update_role` → 最终回复。
- 数据库确认职位和 JD 原文已保存；原文未扩写。但客户名被自行归一为 Harbor North，去掉 Fictional / QA1019；职位薪酬被放入 `client_contact.compensation`，未进入 `brief.priorities`，原始 JD 中仍完整保留。
- 正确说明三位英国 CS/客服候选人均不适合该产品职位，没有硬凑推荐。
- 第二次更新失败明确为：修改 brief 需要本客户新增反馈或已有反馈来源 ID。未把失败更新当作成功保存。

观察到的问题：仅提供资料就直接建立正式职位，超出了“建议入库”的预期；主动扩展薪酬调研并尝试更新职位，导致额外等待和失败卡片。进度使用英文，最终回复使用中文。最终还声称“三人都挂在 Harbor Lantern CS 岗位上”，而 Nina 只有不合适的资料证据，缺少该关系的明确依据；不能把这段措辞视为已验证的关联事实。

## 场景二：明确要求保存并检索

原话：“I've taken on a new search. Please save this JD and find suitable people in my existing candidate library. Use the evidence we already have, explain fit and gaps, and leave missing client details unknown.”JD 为 Fictional Baystone QA1019 / Head of Customer Success：伦敦每周三天到岗、enterprise B2B SaaS、负责续约、直属管理至少四位 CSM、改进续约预测、向 CEO 汇报，薪酬预算未知。

- 对话：`6326ea00-7c3d-4a94-adea-1f62de090c37`。
- 任务：`a8cde1b6-740c-4833-87d9-d81c1e57c3c5`，`done`，约 46 秒。
- 职位：`3a46df19-dd9b-4e6f-ba79-42e7c5b926a7`。
- 实际执行：`save_role` → `read_skill` / `find_candidates` → `list_candidates` / 读取三人原资料 → `read_role` → 最终回复，无工具失败。
- Eva：以 600 万英镑续约组合、直属管理五位 CSM、流失率从 12% 降至 8% 为依据，建议进一步沟通；明确每周三天到岗、薪酬期望、续约预测经验仍待确认。
- Leo：协调六位 CSM 不等于直属管理，人数保持未知，当前证据不足以满足管理要求。
- Nina：消费电商客服经历、没有 enterprise SaaS 续约证据、只接受远程，不适合。
- 明确没有把 Harbor Lantern 的客户反馈套用到 Baystone。薪酬、客户联系人继续未知，没有以缺少这些信息阻塞保存和检索。
- 匹配结论保存在对话；数据库没有给新职位新增候选人关系或正式 assessment，最终把建立关联/保存评估作为可选后续。检索和给建议不等同于建立 shortlist 档案。

## 结论

“明确交代保存 JD 并检索已有候选人”的基础能力通过这组三人样本的本地真实链路测试。只交来 JD 的场景也会保存和检索，但主动写入边界、额外调研/失败重试与输出克制尚有问题，不能判为完整体验验收通过。本记录未修复这些问题，未测试文件上传形式的 JD、大规模人才库、登录回跳或生产环境。

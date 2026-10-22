# 新职位复用既有候选人，不沿用全局好坏标签

## 真实委托

本机 Chrome Computer Use、真实模型/worker、隔离 PostgreSQL `hirelix_workspace_qa_local_20261022`。从 New conversation 提供新的虚构客户 Harborlight Systems，要求另存 Senior Revenue Operations Analyst 职位，从已有候选人库比较相关人选并保存职位评估，不重新上传、不新建人选、不生成文档或外发。

新岗位是 IC，要求 6+ 年 B2B SaaS RevOps、Salesforce reporting、SQL/Tableau、支持周度预测；不要求管理。US/Canada、四小时 Eastern 重叠；USD 175k–195k 或 CAD 210k–230k 加奖金；四周目标。

对话 `dc875872-b2f8-48b5-80be-2dc687e32e9e`，任务 `8cefc7fb-04f2-4005-9d73-1ea1870ee9da` done，保存职位 `e6532548-6b57-4565-94c2-4e9a2908865e`。

## 工程证据与模型观察

- 实际调用私人库语义检索、文字检索、人选读取及现有库列表。语义结果包含九位人选，Taylor/Quinn 排在前面；真实用量账本包含一次 private_semantic_search / siliconflow。没有进入已退役的外部寻访或重新导入 CV。
- 新职位关联原有 Taylor `6a4d7bb8-d56b-4cc3-828b-c387e5e3365c` 和 Quinn `d22bc3e2-7835-4123-a7f2-494c02b5f7cd`，保存两份角色专属评估。人选总数仍 9、文档仍 5、文件仍 16，仅职位从 5 增至 6。
- Taylor 在新 IC 岗得到 worth_discussing，原 Pinecrest 管理岗的 not_aligned 保留；Quinn 在新岗为 needs_more_information，原岗 worth_discussing 保留。这是实际模型判断，不是测试要求必须得到的结论；工程要求是各职位记录独立。
- Pinecrest 两人的评估内容及关系版本与上轮完整只读证据逐项一致；人选版本未变。新职位两人的 sharing=unknown、interest 为空，不继承别的客户的意向或许可。
- 原 PDF/DOCX 文件仍关联原人选，SHA-256 分别为 `2eb8cb3015e8745dca768bcf74fb04e65bb83927d4a80cbcf9dca29683b0525f`、`ac597bcdb8afd93283f95fdd3d90143284cef43705a3a6461a0bc4631f40a141`，与先前真实上传/下载证据一致。此次未重新下载原件。
- 首次 save_assessments 因来源已变更或不属于本候选人/职位而被 409 拒绝，Agent 读取记录后成功保存；最终两个新关系均 v2，没有失败尝试的部分写入。界面仍保留失败尝试，不将恢复后的完成包装成从未失败，也不削弱来源归属约束。

模型能够区分管理与 IC 要求，并指出新岗位的 Tableau 证据及通知期问题；原输入口述 brief 被重新排版保存，不据此宣称逐字原文一致。判断、引用措辞和来源文本质量不等于普遍通过，没有为本样本添加判断分支或强制调用顺序。

## 高频比较的界面调整

职位页原来只展示长段 summary，没有展示已保存的结构化 decision。用户需要逐段阅读才能比较。现将既有结论直接显示为 Role assessment · Worth discussing / Needs more information / Not aligned，列表与证据详情一致。过期记录使用 Earlier role assessment，并保留既有新证据提示及评估时间。

标签只出现在具体职位及其评估中，不写回人选，不建立跨职位“好候选人/坏候选人”标签，不排序或替代 LLM 判断。Chrome 在新职位看到 Taylor/Quinn 的两个独立结论，回到 Pinecrest 可见 Taylor 的 Not aligned 及 Quinn 的 Worth discussing。

职位结果链接首次 DOM 定位点击未生效，改用可见位置的真实坐标点击正常打开详情；随后完整详情在 Chrome 新标签打开，Candidates (2) 可读取两份评估。没有发现链接本身的产品故障，也没有为工具定位问题修改产品路由。

## 检查与边界

TypeScript、lint、git diff --check 通过；全量单测 507 项，492 通过、15 门控跳过、0 失败。此次为已存评估结论的展示，以真实角色数据及浏览器对照验证为主，未新增复刻标签的单测。语义检索、真实业务写入和数据库比对与单测分别记录。

只读结果 `tmp/rediscovery-readback.json`，截图 `tmp/rediscovery-new-role-decision.png`，不提交 tmp。未推送、部署、付款、发布或外发；未修改 Owen 选择和已有提醒。私人库复用的本地链路不代表整库召回完整、生产或续费意愿已验证。

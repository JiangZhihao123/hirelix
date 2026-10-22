# 本地推荐交付、客户反馈与下一次沟通

## 范围与资料

本机 Chrome Computer Use、真实模型/worker、隔离库 `hirelix_workspace_qa_local_20261022`。沿用明确标记的虚构 Harborlight Systems、Taylor 及原 DOCX，仅创建 localhost 测试链接，不向外部发送邮件或部署。测试完已撤销链接；访问令牌未写入本记录。

从新职位的 Taylor 推荐入口进入对话 `729629fe-2bbc-4d29-b55f-026bb24d30e7`，补充虚构 QA 条件：对该客户的意向确认，允许仅向该客户分享原 CV。要求先保存该职位的说明并准备客户材料，不先分享或发送。

## 主流程实测

1. 保存说明 `a9a87cad-5858-4ebb-bf2a-4c4ba67533ea`，同时支持该职位意向与分享许可，没有重复沟通记录。Harborlight permission=confirmed；Pinecrest 仍 unknown。Taylor 档案仍 v1。
2. 复用来源 `490f9eb3-a5b8-4e72-84f3-35632139dd64` 将已有 profile 来源登记为 cv v2，同一原 DOCX、同一人选，无重新导入。生成推荐 `e54b4682-3aed-42f4-bf58-b7b319f729c6`，v2、draft、selected CV=`d1f50a23-cdde-45a9-b836-b5d53f6baf4a`。
3. 另行明确要求创建本地 QA 链接后，生成固定 v2 客户副本。分享 `79e10c5c-1f0a-40fb-b6b7-06e87e8e8531` 不等于送达；推荐仍 draft、submitted_at 为空，email delivery 为 0。
4. Chrome 实际打开客户页、下载 ZIP 和单独 CV。ZIP 含一份推荐 PDF 和一份原 DOCX；ZIP 内 DOCX、单独下载文件与原件 SHA-256 均为 `ac597bcdb8afd93283f95fdd3d90143284cef43705a3a6461a0bc4631f40a141`。PDF 两页均渲染检查，无裁切、重叠或缺字。本次未改动文件生成逻辑。
5. 在 Taylor 的逐人反馈表单提交 QA Client Reviewer / Would like to interview，附 Tableau 实例与可用时间问题，明确未预订面试。页面显示反馈已保存。
6. 数据库只有一条反馈 `6b50ab85-ed3d-473c-98cf-654727aaf1ae`，对应 Taylor、Harborlight、推荐 v2、上述分享，response=interview、identity_verified=false。原对话收到唯一反馈消息 `f16c480c-97be-43de-ae4f-98e57701a022`，界面显示 Name not verified，而非真实客户身份认证或已安排面试。
7. 独立无 Cookie 的 HTTP GET 返回客户页和 CV 均 200，CV 哈希一致；页面 HTML 不含提交的 QA 反馈标记或姓名。这是匿名读取证据，与带登录态 Chrome 的实际交互分开记录，不冒充无登录浏览器上下文。
8. 回到原对话，要求依据刚收到的反馈准备五个通话问题、不要约时间或联系任何人，并撤销本地 QA 链接。Agent 给出围绕 Tableau、Salesforce/SQL 连接与可用时间的问题，保留反馈人身份未验证边界，未生成新文档或联系任何人。
9. 撤销后 Chrome 实际访问旧链接显示 This recommendation is unavailable，旧 CV 下载地址返回 Not found；推荐、原件、说明、反馈历史均保留。没有邮件发送或面试安排。

模型正文中的一次“QA link”指向内部文档，结构化 Open client recommendation 回执指向正确本地客户页；本轮使用真实回执访问，不将生成链接措辞当成事实保证。推荐稿约 380 字、两页，不将“concise”或模型表述当作一页保证，也不据一次输出增加案例逻辑。

## 已修复的界面断点

准备后又精确编辑同一文稿时，同一消息同时显示编辑成果引用和准备完成卡。现按实际文档 ID 去重：已有导出或可打开的编辑成果时，不再重复读取及渲染同一准备卡；其他文档保持独立。没有改变文档、版本、权限或执行逻辑。

真实 Chrome 回读：该对话 Prepared work 区域为 0，Saved document 按钮为 2，分别是消息中的唯一成果引用与输入框的当前文档上下文。可以打开成果继续工作，没有两张重复交付卡。

## 检查、证据与边界

TypeScript、lint、git diff --check 通过。全量单测 507 项，492 通过、15 门控跳过、0 失败；此次是展示去重，以真实交付链路和 DOM 数量核对为主要证据，未新增复刻属性的单测。

只读数据库、下载哈希、匿名读取检查和反馈截图在 `tmp/recommendation-loop-*`，PDF 检查在 `tmp/recommendation-loop-20261022-2143/`；不提交 tmp 或文件令牌。所有 Agent 操作均由实际当前委托执行，未写死工具顺序。

该链路证明本地虚构材料的交付和反馈闭环，不是实际客户反馈、真实送达或生产验收。未推送、部署、外部发布、发送邮件或付款；原测试库、既有提醒和 Owen 待定选择保留。

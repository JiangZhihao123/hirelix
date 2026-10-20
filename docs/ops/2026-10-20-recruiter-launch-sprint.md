# 猎头工作日上线冲刺验收

范围：本地桌面 Chrome、真实独立 worker、隔离 PostgreSQL `hirelix_workspace_qa_queue_20261015`、真实模型/解析/索引。沿用当前测试账号，新建虚构客户 Fictional Alder Sprint 与 Mara Vale、Owen Reed，保留既有资料。没有使用模拟业务结果，没有重复发测试邮件。

本轮依据工程责任标准：核对上传、上下文、工具返回、持久化、界面和操作，不把某次候选人判断直接判作工程失败。模型行为与工程缺陷分开记录。以下结果不等于生产发布验收。

## 场景与证据

- 对话 `3fed5d53-b61a-4bce-8ea5-643cf0ce9fc8`：从正常聊天一次上传客户 brief 和两份单页 PDF，要求保存职位、人选并准备初次沟通。
- 职位 `6b3f74b1-0bb3-4480-93d8-2e23c6027f10`，Mara `dc1c0da4-f82a-4fda-9ab7-54d77d7c4be1`，Owen `d9404190-9b74-448f-82b7-c2b2c9ff3b97`。数据库确认保存，导入及索引任务完成。
- 初轮回复称候选人已在该职位下，但当时数据库未有关联，工具只导入候选人池。此项记录为模型表述与实际状态的差异，不新增强制关联工作流。后续自然要求加入 longlist，实际执行角色关联工具。
- 电话笔记场景包含兴趣、每周到场、通知期、期望薪酬与当前薪酬的保密要求；随后追加合并 PDF 与期望薪酬更正，继续核对。

## 已修复：PDF 来源侧栏空白

真实页面点击 Mara 原始附件，右侧 iframe 持续空白；同一个受保护文件 URL 在 Chrome 新标签页可正常显示。文件上传和解析并未丢失，缺陷位于依赖浏览器嵌入式 PDF 查看器的侧栏预览。

修复复用已有 PDF.js 与 canvas 服务端渲染，在现有文件权限检查之后按请求页返回原始页面图像；侧栏显示翻页、页数和放大/缩小。每次只渲染一页，画布限制为 1200×1800 以内，保留原文件打开和下载入口。不是仅用缩略图代替完整多页预览，也没有用模型重绘原文。

验证：

- 真实 Chrome：单页 Mara PDF 显示并可放大；双页 Combined-CVs.pdf 从 Page 1/2 切换到 Page 2/2，实际显示 Owen 的第二页，边界翻页按钮禁用。
- 7 项实际文件渲染/读取回归通过，包括原始第二页内容不同、总页数、非法页码和不存在页码拒绝，以及既有 Office/PDF/中文字体读取。
- TypeScript、针对性 ESLint、独立输出目录的生产构建通过。构建自动添加的 tsconfig 路径已移除，构建输出移入本地归档，没有混入源码提交。

证据目录：`/Users/noah/projects/hirelix-local-archive/2026-10-20/recruiter-sprint/`。`screenshots/03-source-panel-before.png` 为修复前，`05-source-panel-fixed.png`、`07-pdf-second-page.png` 为修复后。测试 PDF 明确标注虚构人物，原件和截图不提交 Git。

## 推荐、修改、交付与客户反馈

- 合并 PDF 内容与已保存两份 CV 一致，模型读取后未重复导入；数据库仍为两个人选。此次证明自然场景中的避免重复行为，不等同直接覆盖导入工具的所有去重分支。
- 电话笔记中的期望薪酬从 GBP 148,000 改为 146,000；原始 CV、当前薪酬及其内部保密说明保留。四个上传文件的数据库字节 SHA-256 与原件一致。
- 明确取得面向 Alder 的分享许可后生成私有推荐稿。手工修改未确认的通勤描述，自动保存为 v2，再从界面请求 AI 精简为 v3；人工改动得到保留。
- 实际点击下载 PDF、DOCX、ZIP，并检查文件。推荐稿包含 146,000，没有保密当前薪酬 132,000；ZIP 内推荐 PDF 与选中的原始 Mara CV 齐全，原始 CV 哈希相同。复制正文返回可粘贴文本，没有 Markdown 标记。下载不产生交付状态，数据库仍为 draft、submitted_at=null。
- 客户将到场要求改为隔周周二，实际职位 brief 保存为 v2；反馈保存到候选人记录，原推荐稿保留 v3，没有自动改写或发送。
- 提醒由真实 worker 在 2026-10-20 18:15:09 Asia/Shanghai 送回原对话，计划时间 18:15:00；数据库 completed_at 已写入、enabled=false，对应提醒消息仅一条，没有人工推进时钟。

## 已修复：Word 英文多行重叠

原始 UI 下载的 DOCX 在 LibreOffice 实际渲染中，多行英文重叠。相同内容、相同字号/段落设置，仅将 ASCII/hAnsi/cs 字体从 Noto Sans SC 调整为 Arial 后恢复正常。保留 eastAsia 的 Noto Sans SC 和嵌入字体字节，PDF 导出未改动。单独增加 lineRule 或更改字体名称不能解决问题，未纳入修复。

同时发现验收工具环境未正确找到中文字体，导致中文在诊断渲染中缺字；为当前渲染进程提供包含项目字体目录的 FONTCONFIG_FILE 后，中英文样张正常。该配置只在本地归档中，未修改系统字体或产品环境。配置字体后的旧版英文推荐仍重叠，新版实际下载文件整页正常，区分了产品问题和测试环境问题。

验证：实际浏览器重新下载 DOCX，LibreOffice 转 PDF 并渲染整页检查；中英文样张检查；回归验证正文内容、脚本字体映射和 OOXML 字体解混淆后与源字节完全一致。TypeScript、针对性 ESLint 与回归测试通过。尚未覆盖 Windows Microsoft Word 渲染，不据此宣称全部 Office 客户端兼容。

证据：归档 `exports/recommendation-fixed-render/page-1.png`、`exports/bilingual-fontconfig-render/page-1.png`、`final-persistence.json`、`13-reminder-delivered.png`。

## 跨对话续办

从文档页点击 Continue in a new conversation，新对话 `063dc4ae-b448-4019-8aa2-9503b7eb34c0` 请求对照最新客户反馈准备 Mara 电话，明确只读、不要发送。模型取得当前文档和职位工具观察，辨识 v3 推荐仍引用旧到场条件，找回隔周周二、创始人希望沟通、个人 ownership 待追问，以及人工修改的“通勤/搬迁未讨论”。完成后数据库推荐仍为 v3 draft、submitted_at=null，任务 done、一次执行。截图 `14-cross-conversation-readback.png`。

本轮结束边界：两个产品修复已本地提交；真实链路使用本地隔离数据库，没有部署生产。邮件链路沿用同日单封自发自收证据，本轮未重复发信。生产发布、Live 计费回归、外部客户访问与 Windows Word 尚不能由本轮结果替代。

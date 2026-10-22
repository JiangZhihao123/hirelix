# 已保存简历进入推荐材料

## 问题与修复

延续[首次委托与原件下载验证](2026-10-22-first-work-file-downloads.md)。真实首次委托保存了候选人及完整原文件，但来源被登记为 profile；推荐材料仅接受 cv 来源。因此原件虽然能取回，却不能选入推荐材料。Agent 尝试重新导入还会遇到同名人选审阅，无法直接完成用户委托。

在来源记录 owner 增加 `registerCandidateCv`，通过 Agent 工具 `register_candidate_cv` 使用。模型读取来源并判断确为该人简历后，复用同一来源记录和原文件，将 profile 登记为 cv；不重导入、不新建人选、不重写档案、不改变分享许可。服务校验归属、人选关联、原文件存在、支持格式和记录版本，仅接受 profile/cv；重复登记无额外版本。沿用现有记录版本历史、索引及事务授权机制，没有新增工作流或按样本识别简历的规则。

## 本地真实链路

本机 Chrome Computer Use、真实模型和 worker、隔离 PostgreSQL `hirelix_workspace_qa_local_20261022`，使用明确标记的虚构资料。对话 `c05bc5ac-d41b-4642-8e8a-cc3847ad04b5` 中续办“使用已有 Quinn 和原 PDF，补齐内部推荐材料，不重导入、不外发”。跳过的是本轮失败尝试产生的 Quinn 重复提取卡；未操作 Owen 的纠错选项。

- 任务 `da98cb4f-568a-4833-b093-41d270643993` 完成，实际调用登记工具后生成推荐材料。没有约束模型必须按固定顺序调用工具。
- 来源 `25ca1b5d-e204-42bf-8533-b9949cebfa47` 从 profile v1 成为 cv v2，仍指向原 PDF `6b21ed1f-c973-436e-b81c-d6835d54c6c3`。Quinn 档案仍 v1，库中同用户同名人选计数为 1，职位分享许可 unknown。
- 完整内部推荐 `59675eb3-dc27-4bcb-b980-a924082ec34f` v2 为 draft，source_snapshot 包含所选 PDF 的人选、来源、文件 ID 及 SHA-256；submitted_at 为空，两个 QA 推荐文档没有分享记录。
- 打开成果后，界面显示 CV attachments · 1，明确告知 PDF/Word 导出仅含推荐正文，CV 分别下载。实际从该入口下载原 PDF，2648 字节、SHA-256 `2eb8cb3015e8745dca768bcf74fb04e65bb83927d4a80cbcf9dca29683b0525f`，与上传原件及数据库一致。
- 原先缺少 CV 的草稿 `3c6c8bee-7507-47fe-823d-06f2bdf75b6e` 仍独立保留，并非新文档的历史版本。模型回复声称“在该文档历史中”不准确；数据库证据区分两个文档，不能把模型描述当作版本关系证明。

## 回归及边界

新增 `tests/workspace-candidate-cv.integration.test.ts`，开关 `WORKSPACE_CANDIDATE_CV_INTEGRATION=true`；只允许本地 QA 库，所有夹具事务回滚。真实 PostgreSQL 运行 1 项通过，验证登记前材料拒绝原件、登记后接受同一文件及哈希；跨用户、错误人选、过期版本、通话来源、缺原件被拒绝，并核对无重复来源、档案版本和分享许可不变、旧版本历史保留。

`npx tsc --noEmit`、`npm run lint` 通过。`npm run test:unit` 504 项，489 通过、15 个门控集成测试跳过、0 失败；上述新增集成测试已单独开启并通过。`git diff --check` 通过。

这是首次工作成果链路的本地真实验证，不代表生产、付款、续费转化或整体模型回答质量通过。新材料产生了独立文档，后续仍应检查连续编辑时文档关联与版本表述。未推送、部署、付款、发布或外发，未清空测试库。浏览器截图、文件哈希及只读核对留在 `tmp/cv-entry-20261022/`，不提交 tmp。

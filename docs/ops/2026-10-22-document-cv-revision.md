# 在原推荐稿中修改 CV 附件

## 主流程断点

上轮[已保存简历进入推荐材料](2026-10-22-saved-cv-selection.md)验证中，补 CV 产生了另一份推荐稿。工程核对发现：已有文档的精确编辑、重写可以选取新增笔记，却没有增减附件的能力。用户持续修改同一成果时，不应为了补一个 CV 另建文档。

## 修复

复用文档编辑/重写的 sources 契约，增加可选 file_ids：省略或 null 保留原附件，数组表示完整的新选择，空数组移除附件。精确编辑支持空 edits，附件修改无需伪造正文替换，也无需调用第二个写作模型。

初次准备和编辑共用原有 CV 选择约束：必须是当前用户、所选候选人的 CV 原件，格式受支持，每人至多一份，不接受重复选择。重写任务捕获文件选择与快照，保存时与 file_ids 一并更新。原文档 ID、已保存历史和既有分享快照继续保留；已提交文档仍禁止覆盖，修改附件不赋予分享许可、不表示已送达。

## 本地真实链路

本机 Chrome Computer Use、真实 Agent/worker、隔离库 `hirelix_workspace_qa_local_20261022`。打开上轮缺附件的内部稿 `3c6c8bee-7507-47fe-823d-06f2bdf75b6e`，从页面“Revise with your AI assistant”提交：附上 Quinn 已保存 PDF，标题和正文逐字保留，不另建、不导入、不发送、不发布。

- 对话 `6a5384e6-974a-4df8-bff9-a56e30fdb3ff`，真实任务 `59d9ea93-ef2a-49ee-b89b-c30434ba0bde` done。Agent 读取文档与人选后通过 edit_document 完成；不预设模型必须采用这条工具顺序。
- 原页面显示完成及对话入口，CV attachments · 1 包含 Quinn-Hart.pdf；版本历史显示 v1、v2。
- 数据库逐字比较 v1/v2 的 title、content 一致；同一 ID 的 file_ids 从空变为原件 `6b21ed1f-c973-436e-b81c-d6835d54c6c3`，source_snapshot 包含相同 SHA-256。
- Pinecrest 推荐稿总数仍为 2，没有第三份；两名候选人档案仍 v1、分享许可 unknown，文档仍 draft、submitted_at 为空、分享记录为 0。

## 回归与边界

扩展 WORKSPACE_CANDIDATE_CV_INTEGRATION 门控集成测试：原稿无正文改动补附件、无变化重试不增版本、旧版本附件可读、清空附件、默认保留附件、重写任务捕获文件列表，以及跨用户、其他人选文件、重复文件、过期文档版本与已提交文档拒绝修改。所有夹具事务回滚。

真实 PostgreSQL 中开启该测试及 WORKSPACE_DOCUMENT_SOURCES_INTEGRATION，两项通过。TypeScript、lint、git diff --check 通过；全量单测 504 项，489 通过、15 门控跳过、0 失败。

本轮浏览器验证了原稿补附件和版本历史；移除附件、重写任务捕获的边界由真实数据库契约测试验证，未再次调用模型生成宽泛重写。未验证生产、外发、实际付款或续费效果。未推送/部署，未改动 Owen 决策和已有提醒。截图和只读核对留在 `tmp/cv-entry-20261022/`，不提交 tmp。

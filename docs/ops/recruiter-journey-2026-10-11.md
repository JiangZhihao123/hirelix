# 2026-10-11 连续猎头工作验收

以真实 Chrome、正式站与真实模型/数据库执行连续工作；人物 Avery Moss、客户 Fictional Willow / Meridian 和沟通内容均为虚构测试资料。没有真实通话或候选人来信，没有发送邮件或对外分享文件。简历上传、询问、自然回答入库与原件预览的既有证据见 user-experience-2026-10-11.md；本轮继续检验资料如何支持真实工作。

## 修复前实际经历

对话 5ca8fa77-7d44-483b-bb40-7e687ab30889：接到 Willow Product Director 需求 → 找已有候选人 → 会前准备 → 用普通聊天补充通话 → 改口并要求收入保密 → 报告特定客户分享许可并要求 Word 推荐材料。

- 从已有简历找到了 Avery，仓库异常处理、三名 PM 与业务成果都有原始依据。
- 会前建议围绕办公地点、薪资/通知期、职责范围展开，没有假装已经询问候选人。
- 普通的 “Just spoke to him” 保存了记录；“Sorry, £155k…” 更新同一记录到 version 2。
- 首条消息含 fictional QA scenario，未建立 Willow 职位。该措辞可能影响意图解释，因此后续回归使用明确虚构公司名而不把整个任务表述为假设讨论。
- **严重错误**：明说分享给 Willow，Agent 的回复也说 Willow，但实际权限写入了已有的 Meridian 职位，并为 Meridian 排队生成推荐材料。立即在原对话点击 Stop；没有发送材料。
- 当前薪资保密仅出现在助手承诺，原保存的通话正文未保存限制。

错误授权证据：record 394d9f96-3e33-4d6f-ae04-8d60713b8536，relationship 1440b405-ebee-4c10-8fc8-8d5cd8c5e8b6，错误角色 8262c6a0-7feb-4d45-bc08-f3daf00271fd。通过服务端已有 updateRelationship 修复本轮引入的测试状态：version 2 → 3，permission unknown，permission_record_id null；备注明确 Willow 授权不适用于 Meridian。保留错误历史，无删除。这次人工纠偏不算用户链路通过。

## 根因与修改

理解阶段看到完整职位目录，回复阶段仅看到选中的职位资料，但执行 schema 仍允许引用完整目录中的任意角色。现在执行 schema、授权补全、最终动作和文档任务都限定为实际提供身份资料的职位；不允许凭一个未解释的 role_N 选择别的客户。

再次真实回归发现文档请求偶发被误判为发邮件：用户说自己发送，Agent 仍询问收件人。邮件意图规则现在区分收到来信、准备推荐材料和委托 Gmail 发信，并补充中英文真实模型回归。

补充任务理解规则：明确交代接下新职位并开始工作时保存该需求；分析或假设讨论不保存；客户身份不能用相似职位替代；把用户指定的事实保密范围随原记录保存并带入文档指令。授权恢复同时读取必要对话历史。

## 验证

本地真实链路：tests/integration/workspace-recruiter-journey.test.ts，隔离 PostgreSQL + 真实 DeepSeek / SiliconFlow；带相似职位干扰，覆盖自然新需求、已有候选人检索、普通通话补充、原记录更正、保密限制、正确客户的分享授权与推荐文档、缺失另一家客户资料时询问。测试创建的数据为 fixtures，不是已有真实猎头业务。

真实链路最终通过（约 167 秒）：生成文档关联 Willow、包含仓库经历和 £155k，未包含 £145k 或 Meridian；同对话切换 Hazel 时询问缺失的职位资料，未新建授权或文档任务。邮件意图真实模型 8/8 通过。正式站 UI 复测继续追加于下方。

静态与 mock regression：TypeScript / ESLint / build 通过；unit 361 passed、2 skipped。这些不替代网页与真实服务验收。

过程证据目录：output/recruiter-journey-20261011/，包括错误现场截图、停止后的截图与数据库独立回读。

## 正式站修复后连续验收

代码 c360e36，GitHub CI/CD 38069407931 success，Vercel 部署 dpl_3MpMYmC8pQbR4C7E2JSpt2UPnsQM Ready 并绑定 hirelix.online。VPS worker 同 SHA，MainPID 1407238，2026-10-10 16:54:22 UTC 启动后再开始 UI 复测。

真实 Chrome 对话 3146e09e-bde8-42b2-998e-d5bd8fdbe4d5：

1. “I've just taken on … Get this search started” 建立唯一 Willow 职位 c810a23c-82f6-4b97-bc31-6dfe65cf4558，保存原始需求，并从已有资料找到 Avery。没有要求用户填写入库表单。
2. 用 “Just spoke to Avery again … Keep his current earnings between us” 补充 £158k 期望，再用 “Sorry, £155k, not £158k” 改口。同一通话记录 60f70480-d958-4293-bb87-7c6c72736c32 更新到 version 4；其他事实保留，£145k 当前薪资有明确 internal only / not for client-facing material 限制。
3. 报告 Willow 专属分享许可并要求短 Word 介绍、原 CV 附件、自行发送。关系 fc39f781-8a3e-444a-a60d-4f0f6660ad99 对正确 Willow 角色 confirmed，证据 bdf182d8-ad22-4c76-a8a9-4730a693e468；Meridian 仍 unknown，没有再被误授权。
4. 生成文档 a269cdd5-5f9d-4658-961f-469d02dd7382，role_id 为 Willow；file_ids 保留原 CV 6deea2d9-8b52-451c-94df-28977bc0cddd。正文包含仓库异常处理、三名 PM、9h→4h、£155k、三个月通知期和 Bristol Tuesdays；不含 £145k 或 Meridian。
5. 在对话点击 DOCX 导出，文件真实落到 Downloads，再复制到证据目录。下载事件监听工具超时，但实际文件已下载成功；没有通过直调导出 API 替代点击。DOCX 使用 bundled LibreOffice 渲染为一页并逐页查看，无裁切或重叠。文字内容独立读取验证了薪资及客户边界。
6. 从文档详情点击原始 CV 附件下载，SHA-256 与最初上传 PDF 完全一致：4f37a110ef14f7dcddafc825822a944cc59e484bb55225532b7223100d3a92aa。页面明确 DOCX/PDF 导出只含推荐正文，CV 为独立附件；聊天成品卡与侧栏预览目前不直接展示附件下载，需要进入文档完整详情。
7. 普通聊天补充“客户要求一年内带到八名 PM，目前没发推荐”。职位 version 1 → 2，原 JD 保留，新硬要求进入 brief；Agent 识别 Avery 五人上限与新要求冲突，未改写或发送已有文档。
8. 回复“Hold Avery for now … check whether he'd consider eight” 保存暂缓原因。新对话 e42f4b2a-ec93-4b92-b6aa-3d84aecd9921 只问当前进展和下一步，即读到暂缓、未发送、Willow 已授权、£155k、八人与五人的冲突以及应询问 Avery；不需重述背景。

## 体验结论与尚未解决的不足

这条连续流程的保存、检索、更正、专属客户授权、Word 导出、原 CV 附件和跨对话接续已得到正式站证据。未联系真实候选人或客户；虚构沟通内容是验收输入，不是产品自行获取的通话记录。

仍不能称为完整优质体验：普通通话补充从 00:56:22 到 00:58:02 约 100 秒，多数时间显示准备回复；明确要求 brief 后，进展回答仍约两百英文词且引用较多。聊天成品附件入口需要多走一次完整详情页。另本次“又聊了一次”被合并更新原通话记录（保留版本），因此没有验证每次独立沟通自动形成独立事件的时间线体验。上述不足没有用接口成功或测试通过掩盖。

最后文档仍 version 1 / draft / submitted_at null；没有外发、公开分享或安排面试。证据目录包含 03-new-role-saved.png、04-document-with-cv.png、05-role-change-and-hold.png、06-cross-chat-continuity.png、production-*.jsonl、word-text.txt、word-render/、cv-download-sha256.txt。

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

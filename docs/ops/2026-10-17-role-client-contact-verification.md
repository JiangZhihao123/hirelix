# 职位客户联系人与推荐收件人

## 产品决定

职位使用已有的 `client_name` 与 `client_contact.name/email` 保存甲方公司及一位客户联系人，不新增客户实体，也不另设“推荐联系人”。JD 原文仍是招聘要求。

缺少邮箱不阻止保存职位、匹配或准备材料。准备客户邮件时复用职位联系人；若邮箱尚缺，在原对话补齐、更新职位并继续准备。明确“仅本次”的收件人只修改该邮件，永久联系人变更才更新职位。

## 实现

- 职位标题下显示客户联系人及邮箱；缺失时明确标示。编辑表单直接显示姓名、邮箱，其他商务信息仍可折叠。
- 对话准备推荐邮件与推荐交付页面共用 `roleRecipient`，从当前用户拥有的职位读取最新邮箱，不读取旧推荐快照里的联系人。
- 收件人优先级为明确指定、本推荐当前邮件预览、职位联系人。其他推荐的预览不得带入；已取消、已发送等历史邮件不作为默认收件人。
- 推荐交付页面允许临时修改收件人，保留 OAuth 回跳草稿；切换推荐重置编辑状态。
- Agent 通过现有 save_role/update_role/email 工具组合完成联系人保存与继续准备，不增加业务流程引擎。
- 预览和发送回执继续保存实际收件人快照，联系人变更不改写已有邮件。

## 验证范围

本地隔离 PostgreSQL、真实 Agent worker 与 DeepSeek、已登录 Chrome。虚构测试材料仅用于邮件预览，不发布链接、不外发邮件。此记录不代表线上部署或新增的真实投递验收。

自动回归覆盖：邮箱可缺省、默认联系人、临时覆盖、同一预览内容修改、跨推荐隔离、历史邮件不参与默认选择。数据库集成覆盖保存、修改、用户隔离、过期版本拒绝。

## 本次结果

- `npx tsc --noEmit`、修改文件 ESLint：通过。
- `npm run test:unit`：449 通过，8 项环境门控跳过。
- `WORKSPACE_CONTACT_INTEGRATION=true node --env-file=.env --env-file=.env.local --import tsx --test tests/workspace-role-contact.integration.test.ts`：通过。
- 真实 worker + DeepSeek 对话：无邮箱保存 → 请求邮件预览 → 补充 Lisa 邮箱并落库 → 本次改为 temporary 邮箱但不改职位 → 永久改为 Nina 但不改已有预览 → 取消并重新准备后使用 Nina。断言均通过，未产生发送回执。
- 第二次两轮对话复测：缺邮箱时告知将存入职位，不再询问长期/临时二选一；补充后同轮 update_role + email 成功。仅有开场白的测试材料被 Agent 提醒内容不足，此材料不是正式候选人推荐验收。
- Chrome 真实页面确认职位标题旁客户信息、未填邮箱提示、展开的联系人表单，以及交付页带入最新 Nina 邮箱；截图 `tmp/role-contact/recipient.png`。随后在职位编辑表单修改姓名并保存，标题区及版本号正确更新，截图 `tmp/role-contact/role.png`。
- 原始测试证据：`tmp/role-contact/real-chain-result.json`、`recheck-result.json`、`integration.log`、`unit-final.log`。本次创建的两组测试职位、材料和对话在保留证据后清理，避免污染用户资料库。

边界：验证了联系人存取与邮件准备，未对外发送、未发布推荐链接、未部署生产。已有发送确认、幂等与回执逻辑未更改。

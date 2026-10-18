# 本地收件邮件卡片验证 — 2026-10-18

生产发布继续暂停。本轮基于 `d4c892b9` 在本地分支 `qa/local-mail-recall-20261018` 工作，未推送、合并 main 或部署。

## 实现

- `search_mail` 和 `read_mail` 的展示结果进入现有 turn parts，Gmail/Microsoft 邮件直接显示为卡片，保留主题、发件人、时间和邮箱位置证据。
- 点击检索卡片在原对话展开单封正文；返回收起，再次展开复用本次已读取内容。原邮件链接另开标签页。没有新建邮箱主菜单或整箱同步流程。
- 新 GET `/api/workspace/mailboxes/messages` 复用 workspace 认证及现有 `readMailboxMessage`，按当前登录用户取得邮箱权限；现有读取开关、权限与提供商错误仍生效。响应 `private, no-store`，只返回展示字段，不含 token、原始 headers 或其他提供商字段。
- 正文作为纯文本渲染；外部来源链接仅允许对应邮箱提供商的 HTTPS 主机。保留 20 条检索结果、30,000 字正文边界和不完整结果说明。已发送副本不等于收件人送达。
- 加载、空结果、中断、失败和历史未保存结果分别展示；可恢复连接失败可重试，读取未开放/授权错误提供设置入口，不鼓励无效重试。仅增加确定性的结果投影与 UI，不增加智能工作流、依赖或数据表。

## 本轮证据与边界

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| 21 项针对性契约/SSR 回归 + 6 项 turn progress 回归 | 通过 | auth/provider 是模拟边界，不是真实 OAuth 或邮箱投递 |
| 新读取 API 的认证与范围 | 通过 | 未登录 401；读取关闭 409 且不访问提供商；非法参数 400；只使用已认证 user.id；不输出原始 headers/令牌 |
| 应用、scheduler 类型检查及修改文件 ESLint、diff 检查 | 通过 | 未宣称生产 CI 或部署通过 |
| 实际产品组件 + 真实 Chromium | 通过 | 邮件和 HTTP 读取响应是明确标注的合成 fixture，不代表真实邮箱联通 |
| 浏览器交互 | 展开/加载/返回/重新展开、502 重试、409 设置入口、空/失败/加载状态通过；中断状态契约通过 | 1440×1000，无横向溢出、页面异常 0；原邮件链接验证 target/rel，未访问外部邮箱 |
| 实际 localhost 页面 | 显示正常 Google/邮箱登录入口，无错误覆盖层 | 独立浏览器未登录；未复制现有 Chrome 会话，未进行本轮真实 OAuth |
| 真实邮箱读取、真实 embedding 质量 | 未验收 | 本地读取开关未改动，未新增权限或真实发信/模型调用 |

执行命令与当前本地证据：

- `node --import tsx --test tests/workspace-mailbox-cards.test.ts tests/workspace-mailbox-read.test.ts tests/workspace-mailbox-contract.test.ts tests/workspace-mailbox-ux.test.ts tests/workspace-email-card.test.ts tests/workspace-tool-result-view.test.ts`
- `npx tsc --noEmit`、`npx tsc --noEmit --project scheduler/tsconfig.json`、修改文件 `npx eslint`、`git diff --check`。
- `node tmp/local-mail-recall-20261018/cards-browser/run.mjs`：现有 Playwright 1.58.2 和已安装标准 Chromium，临时本机 fixture 服务；浏览器请求限制为 loopback。测试后关闭本轮浏览器与 fixture 服务。
- 浏览器结果：`tmp/local-mail-recall-20261018/cards-browser/result.json`；真实应用入口结果：同目录 `local-app-result.json`。
- 截图：同目录 `cards-collapsed.png`、`card-open.png`、`card-read-unavailable.png`、`local-app-entry-settled.png`。

## 浏览器入口与剩余步骤

checkout 没有 `.agents/skills` 或 `.codex/skills`。当前工具清单没有 CUA/浏览器/Playwright MCP 控制工具；`open_in_codex` 的本地页面请求仅返回 queued，不能算可操作页面证据。已安装 Vercel 插件的 Agent Browser 技能存在，但 `agent-browser` CLI 不在 PATH，未安装新工具。

随后发现并使用项目已经安装的 Playwright/Chromium，成功完成上述真实浏览器组件验证。首次默认 headless shell 不存在，改为已有标准 Chromium 的 executablePath 成功；没有下载浏览器或修改安全设置。不能再笼统称 Mac 或浏览器不可用。

完成真实邮箱链路的最小剩余步骤是：恢复当前任务对现有已授权 Chrome 的 CUA/浏览器控制入口，或在独立测试浏览器由所有者正常登录现有测试账号，再通过产品可见连接状态继续验证。不得复制会话或 token，不默认扩大读取授权。

原凭据诊断拒绝的原始原因、命令作用和实际所需信息保存在 `tmp/local-mail-recall-20261018/credential-diagnostic-denial.txt`。该诊断没有启动，后续未重试或换路径读取凭据。以上浏览器测试使用全新无认证上下文，不是绕过该拒绝。

## 独立复核后的 P3 修正与真实登录尝试

- 独立复核未发现租户隔离/内容安全阻断。修正单封读取失败入口：只有 401/403/409 显示邮箱设置；404/422 保留错误和返回列表；502/429 等可重试失败提供重试。共享的错误动作策略用于读取卡片及工具错误卡片。
- 仅重验受影响部分：错误动作策略回归、SDK 包装错误回归各 1 项通过；类型与修改文件 ESLint 通过；真实 Chromium 合成错误交互覆盖 404、422、409、502，并逐项验证返回列表。证据 `tmp/local-mail-recall-20261018/cards-browser/p3-result.json`、`p3-errors.png`。
- better-auth 会把多种刷新失败合并成 `FAILED_TO_GET_ACCESS_TOKEN`。当前映射 502 只表示无法核实访问，不证明根因是临时网络故障，也不能据此确认授权已撤销。没有从异常文本推断根因；提供商的刷新根因未完整区分。新增回归保证该包装码不泄露原始细节、不直接声称必须重连。
- 本轮正常打开真实 localhost 的 Google 登录入口，并输入已有授权测试账号 `noahjiang2@gmail.com`。Google 随后在 `accounts.google.com/v3/signin/rejected` 显示“此浏览器或应用可能不安全”，未取得应用登录态。没有绕过提示、填写密码、读取凭据或复制会话。已保留本轮可见 Chromium 测试窗口，供明确接手；不要将此结果当作应用 Google OAuth 完整失败的根因判断。
- 现有 Chrome 没有发现标准调试监听入口；未开启端口或修改配置。当前仍没有该 Chrome 的 CUA/浏览器 MCP 控制接口。最小后续步骤是接入已有获准 Chrome 控制入口，优先复用其正常会话；如需本人操作，由所有者在正常 Chrome 打开 `http://localhost:3000/app/settings?section=email`，使用 `noahjiang2@gmail.com` 正常登录。不得把浏览器会话转移到自动化上下文。
- 真实邮箱/真实 embedding 仍未完成本轮验收；`7128d87e` 仅新增 PG + 模拟 embedding 边界测试，没有修改召回实现。生产和推送保持暂停。

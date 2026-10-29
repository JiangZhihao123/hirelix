# 生产落地页与核心功能检查

日期：2026-10-29，Asia/Shanghai。范围为当前生产 `e2fb9ef4d28a8971aec721ad8892d249c799c5a0`；仅检查、运行隔离 QA 自然任务与保存审查记录，没有修改产品代码、生产配置、权益或业务资料，也未发信、分享或投放。

**结论：页面与基础资料功能可用，但不能称“完美”或稳定完成冷启动。新实测的公开找人任务两次因额度预留暂停，未交付名单；现存测试导入的来源行号错位仍在。落地页首屏已经提到导入与公开研究，但实际示例、首个任务与职位入口仍偏已有简历比较。**

## 当前通过的检查

- Vercel 正式域名为部署 `dpl_WJLQWqMx9PNewCeREgqibUpLJDcC` / READY，Web 与 us-2 worker SHA 一致，scheduler/PostgreSQL active、NRestarts=0、stalled=0。不是用此健康结果替代业务验收。
- Chrome 匿名首访检查了真实首屏与主试用 CTA，点击后进入正式登录页，Google、邮箱及密码入口可见，UTM 保留。本轮未新注册或重新走完 OAuth/验证码。
- 首页、`/product`、`/pricing`、候选人 rediscovery/submissions guides 及 `/contact` 均返回 200。首页与定价页一致展示 $49/月、$490/年、每月 3000 credits、7 天/200 credits 无卡试用与不自动转付费。
- 示意人物、推荐及反馈明确标为 fictional/illustrative；未把其冒充真实客户案例。视频资源 200、约 4.26 MB，真实播放器进入画面；没有据此宣称北美冷访问性能或完整全片播放验证通过。
- 登录产品使用已授权 QA owner `6fb18e39-b4a9-4c7f-bc65-02bc709fdac1`；历史会话和可见账号与前轮对应。候选人列表显示 129 人，按第 120 人邮箱检索返回唯一 QA Reese BatchEP，详情可见备注与来源；测试职位可打开并携带角色进入 Agent。
- 业务数据前后保持 people=129、records=444、roles=1，候选人与记录逐行排序哈希与基线完全一致。原有虚构资料未改动；没有查看其他账号业务内容。

## P1：公开研究无法在本次条件下交付

在新对话自然要求为虚构 US/Canada remote Staff PostgreSQL Engineer 职位研究两位潜在人选，给出证据、已核验的当前角色/地点和可用公开联系入口；明确不读私库、不保存或联系。

- conversation `cf5aeedd-5127-4327-9f21-14e536bdb281`；job `8958176d-5396-4558-9adf-9057abd067db`。开始余额 59.26 credits，这是已有 QA 账号的余额，不是零历史的完整 200 credits 首用条件。
- 第一执行 4 个完成模型轮次、9 次成功 `web_search`，第 5 次模型调用前触发 `AgentCreditError`，进入 cancelled / `pause_reason=credit_limit`。无最终文字、无人选名单；页面同时显示 59.26 credits 和“额度不足”，可点击 Continue。
- 消息输入从 736 bytes 增至 245,068 / 411,224 bytes，另有 62,543 bytes tools 和约 9 KB system。第 4 次实际模型输入 127,985 tokens。此前任务内累计结算为 14.5936 credits，并非实际消耗完 59.26；暂停任务按既有“只有 done 计费”规则释放额度，所以恢复显示原余额。这不是已证明的重复扣费。
- 代码 `web-search.ts:34–41` 只给 content 设置 60,000 字符的每次结果总额，snippet/summary 分别按每条 2,000/4,000 字符保留，所有工具观察在当前 ReAct 上下文累积；`agent-model.ts:130–132` 用 UTF-8 字节数作为输入 token 上界按峰值预留。这里有安全上界的依据，不能简单删除保护或任意除以四；但上下文增长与保守预留共同阻断了本次交付。

### Continue 没有恢复此前研究观察

只点击一次 Continue。第二 execution `95ccc980-9d7a-41e2-ba56-ad1b3516fdb0` 又做了 17 次搜索、5 次抓取，7 个完成模型轮次后再次 credit_limit，仍无最终文字。两次累计 26 次搜索和 5 次抓取；未反复点击或充值掩盖失败。

恢复首个模型消息输入再次只有 736 bytes。首次暂停助手消息 content 为空，metadata 没有 sources、没有已提交工具回执；URL 仅留在展示用 parts 内。`agent-context.ts` 把 parts 过滤掉且略过无文字/业务回执的 cancelled 消息；`agent-runtime.ts` 恢复的主要是已完成副作用回执和可见文字。此前公开研究观察没有带回模型，新执行重新搜索。UI 保留可展开 URL，不等于模型拿到了此前研究证据。

终态 cancelled、无活跃租约、call_reservations={}；第二执行账本 consumed_units=reserved_units=183354（18.3354 credits 的本轮任务记录），暂停状态不计入用户已完成任务消费。不能把单次重置后的账本当成两次供应商总成本。该问题应在工具观察体积、上下文及恢复 owner 处理，不写“找两个人”等案例分支，不规定搜索次数或招聘步骤。

## P1：来源声明仍有质量问题

本轮没有重新导入或修改旧测试结果。只读回读前轮生产 49 条重叠 CRM 行的规范化输入/回执，与本地未修改原 CSV 的邮箱位置逐条比较：1 条正确、48 条错位。例如 person001 声明 row=1，实际为第 49 个数据行。

原始文件和人选仍对应，错误是模型声明的源行位置，不能由“完整保留原件”推断引用位置可靠。当前通用服务检查归属、SHA、版本和事务，不验证任意来源语义；此次没有证明工程丢失原文。后续不能仅依赖“0 unresolved”或任务 done 宣称来源质量已过关。

## P2：冷启动引导与核心方向仍有距离

- 首屏说明已有候选人与 public web research，方向正确；主故事、推荐示例和 First Assignment 仍围绕已有简历、长期关系和客户推荐。首次用户带本地目录/常用 SaaS 导出进来，以及只有 JD 时如何开始研究，缺少同等具体的结果示例。这是产品表达判断，不是功能 500。
- 空库模式提供“Bring my existing candidates / Research people on the public web”，但有职位后的通用开场换成日常跟进。职位页进入 Agent 的“Find candidates for this role”实际预填限定 `my private library`，没有同级公开研究起步项。本轮实际点击并核对草稿，没有发送该任务，随后清空草稿。
- 暂停提示把“当前这次调用预算预留不够”概括为“额度不足”，余额又在暂停后恢复，缺少用户可以理解的原因和继续前的预期；Continue 在本次重启研究后再次暂停，恢复成本对用户不透明。

## 范围与证据

这是生产现状审查，不是整站重新放行。没有重测实付月/年订阅、外发邮件、客户分享、删除、超大文件、并发、多 ATS 全量备份或真实猎头留存。本次 UI 及真实任务均在桌面 Chrome；不对移动端或全部目标地区网络做保证。

本机忽略目录 `output/production-review-20261029/` 保留匿名首屏/登录、候选人检索/详情、职位、暂停截图；公共页面原文、发布/健康读回、首轮与续办的独立证据、真实 provider usage、单个 QA job 日志、源行复核及前后业务数据哈希。产品代码与生产部署保持不变。

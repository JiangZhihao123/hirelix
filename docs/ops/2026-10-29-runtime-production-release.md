# Runtime 资源暂停优化：生产发布

日期：2026-10-29，Asia/Shanghai。用户明确授权“部署并进行推广”。本次发布不包含新迁移、依赖或 Docker 镜像变更。

## 发布结果

- 提交 `e2fb9ef4d28a8971aec721ad8892d249c799c5a0` 已推送至 main，包含 runtime 优化及前四个验收文档提交。
- [GitHub Actions 40723607749](https://github.com/JiangZhihao123/hirelix/actions/runs/40723607749) 的构建、类型、全仓 lint、单测与 deploy-scheduler 均成功。
- Vercel 部署 `dpl_WJLQWqMx9PNewCeREgqibUpLJDcC` READY，对应该提交的 Vercel 状态 success；部署 alias 包含 `hirelix.online`、`www.hirelix.online`。正式域名读回指向同一部署。
- us-2 `/opt/hirelix` 为相同完整 SHA、工作树干净，scheduler 重启后稳定存活、NRestarts=0；健康检查 stalled=0。沿用此前验证的 `hirelix-agent-sandbox:1` 镜像 `sha256:75ea03e53b3de42f9fbdc03ca85f05bdfe3ea60435fc94b97ba64c5062656faf`，未更改 Docker 权限、生产环境配置或防火墙。
- 推送前主机可用空间 7.3 GiB、无 queued/running 工作，未读取其他账号的业务内容。未执行数据库迁移或数据回滚。

## 真实生产冒烟

沿用已授权的专用 QA owner `6fb18e39-b4a9-4c7f-bc65-02bc709fdac1`。Chrome 当前历史会话标识、试用余额及可见账号与前轮 QA 记录对应。新对话上传相同的原始 SaaS 50 行导出和 120 人虚构 seed 文件，要求只读数据质量分析，明确不访问候选人库、不导入、不提醒、不联系任何人。

- conversation `7c93fa54-cc68-495b-b9cf-88b17e84c590`；job `7786a865-7e17-47ec-8a43-fe85c1c6da43`，attempts=1、done、error=null，14 个 ReAct 模型轮次。
- 实际 13 次 Bash、1 次 read_skill；两次 Bash 路径错误以 422 和原始 stderr 返回，模型随后自行纠正并继续，没有 runtime 自动隐藏错误或要求人工重试。其余 11 次 Bash 成功；供应商 usage 为 14 个主模型成功事件及 1 个标题事件。
- 主要结果 50/120 输入行、121 位不同人、49 条重叠、120 条 seed notes、8 条多行、12 位缺电话均与原件核对一致。
- **模型文字仍有两个次要数字错误**：末尾把 120 个 QA 邮箱写成 119；把 44 个共享非空电话写成 45。没有工程丢失原文的证据，按模型质量记录，不以固定流程、CSV 平台分支或提示词堆叠修补。本次不能称全部分析结论准确。
- 前后 people=129、records=444，逐行内容排序哈希分别保持 `f4eb019321012c42a2835d31e622282c` 与 `f3883dababe457f54cccb9e7bcc44215`。执行工具没有候选人库查询或业务修改、发送、分享、定时委托调用。
- 结束账本 consumed_units=reserved_units=51423，即 5.1423 credits，call_reservations={}；任务容器与卷结束后已清理。

这是新版本的生产文件/模型/runtime 只读冒烟，未把它称为生产重新导入 120 人。超过 20 轮一次完成的 121 人入库，以及资源暂停、停止、Continue、租约和副作用去重的验证，见[本地验收](2026-10-29-agent-resource-pauses.md)。没有在生产故意耗尽 15 分钟或试用额度。

## 推广状态与证据

已准备免费目录的当前产品文案与专用 UTM；最终提交仍待浏览器操作时确认，未声称已发布、已收录或获客，见[推广准备](../growth/2026-10-29-cold-start-directory-submission.md)。未付费投放或发送营销邮件。

本机忽略目录 `output/release-promotion-20261029/` 保存 CI、Vercel 正式域名读回、生产主机健康、单个 QA job/账本、前后数据哈希、Chrome AX 与截图；未保存或读取其他账号业务资料。此记录本地提交，不另触发无产品改动的生产发布。

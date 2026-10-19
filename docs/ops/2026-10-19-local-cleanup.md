# 本地 stash、工作树与临时文件整理

日期：2026-10-19。

## 保留

- 原 stash 中历史邮件发送 CSV 的 19 行追加记录恢复至原文件；逐字节核对与 stash 版本一致，28 行（含表头）列数一致。只是恢复记录，没有发送新邮件。
- 咨询答复、评分表样例及生成脚本、设计原型、测试截图与结果、诊断脚本和历史日志保存在本机私有归档 `/Users/noah/projects/hirelix-local-archive/2026-10-19`。逐文件 manifest 记录原路径、决策和哈希；压缩包所有保留文件已读回校验。
- 三套原环境配置私下保存，主目录配置未覆盖。配置与原始证据不提交 Git。

## 清理

- 删除三个已完成审查的 detached 工作树：whole-product-audit、search-console、agent-gmail，使用 git worktree remove。
- 删除主目录未跟踪 tmp；去重 130 份文件，不归档 Git 已有的 1,139 份源码副本；依赖、构建与类型缓存不保留。
- 原 stash 的有价值资料已恢复或归档，删除 stash。
- 旧 Gmail 自定义 QA worker 已被主线开发 worker 替代；旧 tsconfig 的构建路径变更没有合入主线，历史差异仅留本地归档。

## 本地运行

删除前确认隔离库没有 queued/running 任务；停止旧工作树网页、worker 和 3200 预览，确认清理目录没有进程占用。
从主目录 main 启动 3000 网页和独立 worker，沿用旧审计服务的隔离配置作为进程环境。直接运行 npm run dev 仍会使用主目录原 .env.local；本次没有覆盖它。

本次属于资料与目录整理，不改产品逻辑。服务启动和网页可达仅证明本地运行恢复，不代表重新完成 OAuth、Agent 任务或生产链路验收。

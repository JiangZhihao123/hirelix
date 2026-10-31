# VPS 磁盘清理：2026-10-31

用户明确授权清理 us-2，并补充量化研究中的可重建文件也应纳入范围。本次没有迁移应用、改 DNS、注册新账号或购买服务。

## 结果

- 初始 `/` 可用约 112MiB、占用 100%；最终可用 **10,215,354,368 bytes（约 9.6GiB）**、占用 **88%**。净释放约 9.5GiB，以 `df` 为准，不叠加存在硬链接的 `du` 统计。
- PostgreSQL、Nginx、Hirelix scheduler、CoKiti API 和量化强平数据采集服务均为 active；Hirelix 数据库实际查询 `SELECT 1` 成功。未重启这些服务。
- 官网最后实测仍为 HTTP 402：Vercel 团队 CPU 额度封停尚未解除，磁盘清理不等于官网恢复。

## 量化缓存

清理 `/home/noah/tiance_p017_research_data/staged/binance_vision/` 下 `futures_um_klines_5m` 和 `futures_um_premium_klines_5m` 两组可重建 Parquet 缓存。共 16,058 个文件，原分配空间 6,620,065,792 bytes。逐一读取原始 ZIP 并校验 SHA-256，与下载清单全部一致；四个首尾样本由现有 `binance_vision_stage.py` 重建，20 个行情、可用时间和来源字段一致，只有 `ingested_at` 随新入库发生变化。原入库时间逐文件存档。

先将对应 staging 行从 `verified` 标记为 `cache_evicted`，再删除文件，保留原始 ZIP/CHECKSUM、下载清单、其他数据集及 curated 数据。原 staging 行、缓存元数据与实际删除记录保存在远端 `manifests/storage-cleanup-20261031/`，本机忽略目录也有副本。没有改动研究仓库已有源码或定稿结果。

清理后，两类各用现有完整命令实际重建一份，均回到 `verified`：剩余 cache_evicted 分别为 8,175 和 7,881。后续完整的 5 分钟研究必须先重建剩余缓存；不能将它们当作仍在磁盘上。重建命令、原入库时间说明和当前 staging 源码快照保存在审计目录。

## 其他清理

- 清理 root npm 下载缓存，三个过期的不完整安装包/传输文件，四处 Next.js 的 webpack/turbopack 构建缓存。
- 两个旧 CoKiti ASAR/ZIP 实验目录先完整备份到本机，逐文件 SHA-256 核验成功，再核查远端未变化后移除远端副本。当前发布下载和与发布版本硬链接的安装包未删除。
- pnpm prune 没有释放文件。临时退款验收目录未发现 package-lock.json，因此没有清除它的 node_modules；没有把跳过的操作计为已清理。
- 未清理数据库、日志、当前采集原始数据、Docker 运行镜像或 Agent sandbox 镜像。

本机证据与备份：`output/vps-cleanup-20261031/`（Git 忽略）。详细恢复说明见该目录 `README.md`；最终状态见 `final-verification.txt`。

Vercel 官方明确禁止规避平台用量限制，本次未执行以绕过当前封停为目的的换号操作：https://vercel.com/docs/limits/fair-use-guidelines

# VPS 公开站点迁移：2026-10-31

用户授权继续清理并先将落地页放到自有 VPS。本次复用已发布的同一 Next.js 应用，不另造静态页或复制营销文案。没有注册新 Vercel 账号、升级订阅或购买服务。

## 当前已验证

- `/opt/hirelix` 干净，版本 `83d79041f99c5a3c0c7dd9e75477f5d3877e39bc`，与被封停的原生产部署相同。
- 独立发布目录 `/opt/hirelix-web-releases/83d79041`；依赖从已安装的同版本 `node_modules` 同盘硬链接复制，保留生产 scheduler 的源目录。完整 Next.js production build 和构建内 TypeScript 检查成功。
- 新增 `hirelix-web.service`，非 root 的 noah 用户运行 `127.0.0.1:3220`。加载 `/etc/hirelix.env`，再以 root/0600 的 `/etc/hirelix-web.env` 覆盖网页服务配置；数据库为本机 PostgreSQL，auth origin 为原 `https://hirelix.online`。服务 active/running、NRestarts=0。
- 实测首页、价格页和匿名 auth session API 均 HTTP 200。真实 Chrome 经本机 SSH 转发 `127.0.0.1:3320` 查看 VPS 页面，样式与助理定位正确；视频实际播放，读取到 currentTime 大于 23 秒且 readyState=4；点击试用到达原登录页。没有提交登录、创建产品任务、支付或触达客户。
- 该预览经回环 IP 访问，生产遥测按现有规则忽略，数据库没有新增预览事件；不能将此当作外网访问统计链路已验收。正式域名切换后必须核实真实外网请求的 Host、客户端 IP 和事件持久化。

## DNS 与 HTTPS 已配置

域名使用 Namecheap DNS：`dns1.registrar-servers.com` / `dns2.registrar-servers.com`。用户完成登录后，已在 Advanced DNS 保存以下两项修改，TTL 保持 Automatic；保存前后完整展开记录的文本比较，仅这两个值发生变化：

| 名称 | 原类型 | 原值 | 目标 |
| --- | --- | --- | --- |
| `@` | A | `76.76.21.21` | `65.49.232.163` |
| `www` | CNAME | `cname.vercel-dns.com` | `hirelix.online` |

未观察到 apex AAAA。邮箱 MX、SPF、DKIM、DMARC 及其他子域名保持原值。Google 公共 DNS over HTTPS 已返回新 A 和 CNAME；本机与 VPS 的默认递归解析曾仍返回旧 Vercel 地址，旧缓存 TTL 为 1800 秒。此时普通浏览器仍显示 Deployment Paused，不能将新服务器上的成功响应视为该浏览器已经恢复。

此前代登录时遇到登录按钮禁用与页面脚本报错，未绕过限制；用户接管并登录后才执行上述 DNS 修改。没有读取、输出或重置密码。

使用既有 certbot 和 ACME 账号，通过 webroot 签发了 apex/www 的 Let's Encrypt 证书，路径 `/etc/letsencrypt/live/hirelix.online/`，有效期至 2027-01-29。正式配置 `deploy/nginx/hirelix.online.conf` 已安装到 `/etc/nginx/sites-available/hirelix.online` 并启用，替换 HTTP bootstrap；`nginx -t` 和 reload 成功。既有其他站点的重复 server_name 告警未改动。

HTTP 跳转 HTTPS，www 跳转 apex，保留路径和查询参数。Nginx 向 `127.0.0.1:3220` 转发 Host、客户端地址和 HTTPS scheme，关闭响应缓冲，保留原站 HSTS。作为直接面向公网的唯一代理，使用 `$remote_addr` 覆盖 X-Forwarded-For，避免把客户端自行提供的地址当成真实访问者。`certbot.timer` enabled/active，已有通用 deploy hook 会检查并 reload Nginx；针对本证书的 `certbot renew --dry-run` 成功。

VPS 内通过 `curl --resolve hirelix.online:443:127.0.0.1` 验证真实域名证书，未关闭证书校验：首页、价格页、产品页、隐私页、条款页、llms.txt、robots.txt、sitemap.xml、分享图均 200；视频范围请求 206，www 跳转 301，HSTS 响应头正确。此项证明新服务器和证书，不单独证明各地 DNS 已刷新。

### 正常公网浏览器复核

北京时间 2026-10-31 16:19 左右，默认 DNS 返回 65.49.232.163，普通 HTTPS 请求从 Vercel 402 恢复为 Nginx 200；本机与 VPS 默认解析下请求均成功。真实 Chrome 直接打开正式 HTTPS 域名，确认首页标题、$49/月助理定位和样式正确；实际播放正式域名的视频，currentTime=4.60 秒、readyState=4、无媒体错误。点击 Try your assistant free 到达原有内部 QA 账号工作区，会话和历史数据保持可读，没有新建任务、发送消息、注册账号或支付。

www HTTPS 实测 301，保留查询参数并跳转主域名。正式地址的四项现有请求回归（公开页面元数据、产品与价格一致性、FAQ 结构化数据、无 JavaScript 可抓取的产品资料）全部通过；没有关闭 TLS 校验或修改 hosts/代理设置。等待旧 DNS 缓存过期期间，清理本机代理缓存的后续脚本未执行成功，随后缓存自然刷新，不能把该脚本当作恢复原因。

Chrome 实际发出的 landing-event 请求均 200，响应 `{ok:true}`；只读生产数据库核实 page_view、CTA 点击等事件已持久化，来源为 `qa_vps_cutover_20261031`。这些记录的 internal 字段为 false，因此统计真实外部访问时须明确排除该来源及关联 visitor，不能只按 internal 字段过滤，也不能将其算作新客户。VPS 没有 Vercel 的地域头，本轮 country 为 unknown，不应据此判断访客国家。截图：`output/vps-web-20261031/production-home-https.png`。

完整的新 OAuth 登录、登录后 Agent 执行、邮件发送与实际付款链路不属于本次落地页迁移验收；现有 QA 会话成功不代替这些测试。

### 配置一致性与已有缺项

原 Vercel 网页配置与 scheduler 配置有通知开关、发信凭据等差异，不能让网页直接继承后台的全部行为。已从原项目的 production 环境提取 63 项应用配置到独立 web 环境文件，排除 Vercel 平台变量；DATABASE_URL、INTERNAL_API_SECRET 和 NODE_ENV 由 VPS 基础环境保留。读取实际运行进程环境，63 项均与原 production 值完全一致，数据库主机为 127.0.0.1。没有修改 scheduler 的基础环境或重启该服务。

Paddle 当前 Agent 套餐的公开配置、客户端 token 和 webhook secret 均存在；原 Vercel 与 VPS 均未设置 PADDLE_API_KEY，账单门户缺少配置是已有问题，本次未用本地测试凭据替代生产凭据，也未声称付款/门户链路验收通过。

若后续需停止 VPS web，只停止 `hirelix-web.service`；不要停止 `hirelix-scheduler` 或共享 Nginx/PostgreSQL。DNS 可回到上表原值，但原 Vercel 团队仍被封停，回切不能恢复业务。

## 清理增量

另核验并清理 74,823 份可重建的日线和 metrics 中间 Parquet，原分配空间约 1.91GB；保留原始 ZIP、校验文件和审计元数据，两类各实测重建一份。当前其他量化研究正在运行，本轮逐项排除了其锁定输入，未改动策略代码或定稿结果。新的发布构建占用了部分空间，最终约 11GiB 可用、占用 86%。恢复命令和元数据见忽略目录 `output/vps-cleanup-20261031/README.md` 及 VPS 数据目录 `manifests/storage-cleanup-20261031/`。

## 证据与边界

忽略目录 `output/vps-web-20261031/` 保存真实 Chrome 截图、DNS 保存前后文本及截图。VPS 构建日志 `/var/log/hirelix/web-build-20261031.log`；服务日志 `journalctl -u hirelix-web`。未输出、提交或更改环境凭据；新增配置不包含凭据。

Next.js 官方自托管建议使用 Node server 与 Nginx 反向代理：https://nextjs.org/docs/app/guides/self-hosting 。本轮按该方式复用现有项目。

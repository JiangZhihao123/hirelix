# VPS 公开站点恢复准备：2026-10-31

用户授权继续清理并先将落地页放到自有 VPS。本次复用已发布的同一 Next.js 应用，不另造静态页或复制营销文案。没有注册新 Vercel 账号、升级订阅或购买服务。

## 当前已验证

- `/opt/hirelix` 干净，版本 `83d79041f99c5a3c0c7dd9e75477f5d3877e39bc`，与被封停的原生产部署相同。
- 独立发布目录 `/opt/hirelix-web-releases/83d79041`；依赖从已安装的同版本 `node_modules` 同盘硬链接复制，保留生产 scheduler 的源目录。完整 Next.js production build 和构建内 TypeScript 检查成功。
- 新增 `hirelix-web.service`，非 root 的 noah 用户运行 `127.0.0.1:3220`，复用 `/etc/hirelix.env`；数据库为本机 PostgreSQL，auth origin 为原 `https://hirelix.online`。服务 active/running、NRestarts=0。
- 实测首页、价格页和匿名 auth session API 均 HTTP 200。真实 Chrome 经本机 SSH 转发 `127.0.0.1:3320` 查看 VPS 页面，样式与助理定位正确；视频实际播放，读取到 currentTime 大于 23 秒且 readyState=4；点击试用到达原登录页。没有提交登录、创建产品任务、支付或触达客户。
- 该预览经回环 IP 访问，生产遥测按现有规则忽略，数据库没有新增预览事件；不能将此当作外网访问统计链路已验收。正式域名切换后必须核实真实外网请求的 Host、客户端 IP 和事件持久化。

## DNS 与 HTTPS 尚未完成

域名使用 Namecheap DNS：`dns1.registrar-servers.com` / `dns2.registrar-servers.com`。本轮读取到原记录：

| 名称 | 原类型 | 原值 | 目标 |
| --- | --- | --- | --- |
| `@` | A | `76.76.21.21` | `65.49.232.163` |
| `www` | CNAME | `cname.vercel-dns.com` | `hirelix.online` |

未观察到 apex AAAA。只修改上述网站记录，保留邮箱 MX、SPF、DKIM、DMARC 及其他子域名。Chrome 已打开对应域名 Advanced DNS 地址，但被 Namecheap 引导到登录页；已请求用户在浏览器登录，不能把登录缺失称为已切换。

后续用户明确要求代为登录。已用 Chrome 原生保存密码自动填充，未读取或输出密码明文；正常键盘输入、刷新及官方账户入口均未解除主登录按钮的 disabled 状态。控制台持续观察到 Namecheap 全局脚本相关的 `Invalid regular expression: /^/support(/: Unterminated group`，但尚未证明该报错就是按钮禁用的根因。未登录成功、未进入 DNS 管理、未改记录。没有强行解除按钮禁用、调用隐藏提交接口、重置密码或绕过验证。页面保留等待用户接管，截图为 `output/vps-web-20261031/namecheap-login-blocked.png`。

VPS 已安装仅 HTTP 的 ACME bootstrap vhost，`nginx -t` 通过、reload 成功，Host 为 hirelix.online 时返回预期 HTTPS 301；既有其他站点重复 server_name 告警未改动。正式 TLS 配置源在 `deploy/nginx/hirelix.online.conf`，当前尚未安装，因为 apex/www 的证书尚未签发。

用户登录后完成步骤：

1. 在 Namecheap 核实当前完整记录，再将 `@` A 改为 VPS IP，`www` CNAME 指向 apex；保存原值、TTL 与截图。
2. 等权威 DNS 返回新值，验证 `/.well-known/acme-challenge/` 从外网可达。
3. 使用已安装 certbot 和已有 ACME 账号，为 apex/www 通过 webroot 签发免费证书；不关闭证书校验。
4. 安装 `deploy/nginx/hirelix.online.conf`，将启用项从 bootstrap 切到正式文件，`nginx -t` 后 reload。
5. 从 Chrome 和独立 HTTP 请求核实正式 HTTPS 首页、资源、www 跳转、视频、试用到登录、实际访问统计。更新本记录后才宣布正式域名恢复；完整登录后 Agent、邮件和付款仍应另行验收。

若后续需停止 VPS web，只停止 `hirelix-web.service`；不要停止 `hirelix-scheduler` 或共享 Nginx/PostgreSQL。DNS 可回到上表原值，但原 Vercel 团队仍被封停，回切不能恢复业务。

## 清理增量

另核验并清理 74,823 份可重建的日线和 metrics 中间 Parquet，原分配空间约 1.91GB；保留原始 ZIP、校验文件和审计元数据，两类各实测重建一份。当前其他量化研究正在运行，本轮逐项排除了其锁定输入，未改动策略代码或定稿结果。新的发布构建占用了部分空间，最终约 11GiB 可用、占用 86%。恢复命令和元数据见忽略目录 `output/vps-cleanup-20261031/README.md` 及 VPS 数据目录 `manifests/storage-cleanup-20261031/`。

## 证据与边界

忽略目录 `output/vps-web-20261031/` 保存本机真实 Chrome 截图。VPS 构建日志 `/var/log/hirelix/web-build-20261031.log`；服务日志 `journalctl -u hirelix-web`。未输出、提交或更改环境凭据；新增配置不包含凭据。

Next.js 官方自托管建议使用 Node server 与 Nginx 反向代理：https://nextjs.org/docs/app/guides/self-hosting 。本轮按该方式复用现有项目。

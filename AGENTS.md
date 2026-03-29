# Agents Reference

## Collaboration Rules

- 默认情况下，完成一个主要任务后应立即提交一次，避免把多个不相关改动混在同一个 commit 里。
- commit message 使用中文，清楚说明这次提交解决了什么问题或完成了什么改动。

## 技术原则：用 LLM 而非正则处理文本问题

**禁止**用正则表达式解决任何核心文本理解、清洗或修复问题。正则只适合处理格式严格的字符串（如日期格式、URL 提取、邮箱校验）。

凡涉及以下场景，必须调用 LLM：
- 自然语言文本的清洗与修复（如抓取数据的乱码、粘连单词、格式噪声）
- 文本内容的判断、分类、提取
- 任何"看起来像正则能搞定但边界情况很多"的文本处理任务

**原因**：正则在语言边界模糊时副作用不可控，而 LLM 能理解语义上下文，处理结果更准确、更健壮。

## Test Credentials

| 环境 | 邮箱 | 密码 |
|------|------|------|
| 本地 dev / Supabase | jzh_spring@163.com | 88888888 |

> 登录方式：邮箱 + 密码（不是 Google OAuth）

## Dev Server

```bash
npm run dev
```

默认跑在 http://localhost:3000。调度器已从 Next.js 进程中拆离，本地如需同时运行调度器：

```bash
# 另起一个终端
npm run scheduler:dev
```

## Network Notes

- 在中国大陆本地开发时，服务端访问 Supabase 和其他外部服务默认需要通过本地代理。
- 默认代理地址是 `http://127.0.0.1:7890`。
- 生产环境默认不需要代理；不要把”本地需要代理”的假设带到生产配置里。

## VPS 生产环境

连接信息与 sibling 项目 `neliva` 共用同一台 Vultr VPS。

- Host: `66.42.53.127`
- SSH user: `root`
- SSH port: `2222`
- 服务器 hostname: `vultr`

直连（需本地代理）：

```bash
ssh -o “ProxyCommand=nc -x 127.0.0.1:7890 %h %p” -p 2222 root@66.42.53.127
```

快速连通性检查：

```bash
ssh -o “ProxyCommand=nc -x 127.0.0.1:7890 %h %p” -o BatchMode=yes -o ConnectTimeout=10 -p 2222 root@66.42.53.127 'echo VPS_OK && hostname'
```

Hirelix 部署目录：`/opt/hirelix`

## 部署架构

- **Next.js 前端 + API**：部署在 Vercel（不含调度器）
- **搜索任务调度器**：独立进程，运行在 VPS，systemd 服务 `hirelix-scheduler`

### 调度器部署（VPS）

调度器代码在 `scheduler/` 目录。部署流程：

```bash
# 1. 同步 scheduler/ 目录（及其他改动的源码）
rsync -az \
  -e 'ssh -o “ProxyCommand=nc -x 127.0.0.1:7890 %h %p” -p 2222' \
  /Users/noah/projects/hirelix/scheduler/ root@66.42.53.127:/opt/hirelix/scheduler/

# 2. 如有新 npm 依赖，在 VPS 上安装
ssh -o “ProxyCommand=nc -x 127.0.0.1:7890 %h %p” -p 2222 root@66.42.53.127 'cd /opt/hirelix && npm install'

# 3. 重启调度器
ssh -o “ProxyCommand=nc -x 127.0.0.1:7890 %h %p” -p 2222 root@66.42.53.127 'systemctl restart hirelix-scheduler'
```

环境变量：`/etc/hirelix.env`（systemd EnvironmentFile，包含所有生产 env vars）

### 服务管理（systemd）

```bash
# 调度器
ssh -o “ProxyCommand=nc -x 127.0.0.1:7890 %h %p” -p 2222 root@66.42.53.127 'systemctl status hirelix-scheduler --no-pager'
ssh -o “ProxyCommand=nc -x 127.0.0.1:7890 %h %p” -p 2222 root@66.42.53.127 'systemctl restart hirelix-scheduler'
ssh -o “ProxyCommand=nc -x 127.0.0.1:7890 %h %p” -p 2222 root@66.42.53.127 'journalctl -u hirelix-scheduler -f'
```

生产域名：`hirelix.online`（部署在 Vercel 后，DNS A 记录指向 Vercel）

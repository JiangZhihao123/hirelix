# Agents Reference

本文档包含 Hirelix 项目的开发规范和运维指南。

---

## 目录

- [开发规范](#开发规范)
  - [协作规则](#协作规则)
  - [技术原则](#技术原则)
- [本地开发](#本地开发)
  - [测试账号](#测试账号)
  - [启动开发服务器](#启动开发服务器)
  - [网络代理](#网络代理)
- [生产环境](#生产环境)
  - [VPS 信息](#vps-信息)
  - [部署架构](#部署架构)
  - [调度器部署](#调度器部署)
  - [服务管理](#服务管理)

---

## 开发规范

### 协作规则

- **提交频率**：完成一个主要任务后应立即提交一次，避免把多个不相关改动混在同一个 commit 里
- **Commit Message**：使用中文，清楚说明这次提交解决了什么问题或完成了什么改动

### 技术原则

#### 用 LLM 而非正则处理文本问题

**禁止**用正则表达式解决任何核心文本理解、清洗或修复问题。正则只适合处理格式严格的字符串（如日期格式、URL 提取、邮箱校验）。

以下场景**必须**调用 LLM：
- 自然语言文本的清洗与修复（如抓取数据的乱码、粘连单词、格式噪声）
- 文本内容的判断、分类、提取
- 任何"看起来像正则能搞定但边界情况很多"的文本处理任务

**原因**：正则在语言边界模糊时副作用不可控，而 LLM 能理解语义上下文，处理结果更准确、更健壮。

---

## 本地开发

### 测试账号

| 环境 | 邮箱 | 密码 |
|------|------|------|
| 本地 dev / Supabase | `jzh_spring@163.com` | `88888888` |

> **注意**：登录方式使用邮箱 + 密码，不是 Google OAuth。

### 启动开发服务器

```bash
# 启动 Next.js 应用（默认 http://localhost:3000）
npm run dev
```

调度器已从 Next.js 进程中拆离，如需同时运行调度器：

```bash
# 另起一个终端
npm run scheduler:dev
```

### 网络代理

| 场景 | 代理设置 |
|------|----------|
| 中国大陆本地开发 | 需通过本地代理 `http://127.0.0.1:7890` 访问 Supabase 和外部服务 |
| 生产环境 | 不需要代理 |

> **注意**：不要把"本地需要代理"的假设带到生产配置里。

---

## 生产环境

### VPS 信息

与 sibling 项目 `neliva` 共用同一台 Vultr VPS：

| 配置项 | 值 |
|--------|-----|
| Host | `66.42.53.127` |
| SSH User | `root` |
| SSH Port | `2222` |
| Hostname | `vultr` |
| 部署目录 | `/opt/hirelix` |

#### SSH 连接命令

```bash
# 直连（需本地代理）
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222 root@66.42.53.127

# 快速连通性检查
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -o BatchMode=yes -o ConnectTimeout=10 -p 2222 root@66.42.53.127 'echo VPS_OK && hostname'
```

### 部署架构

| 组件 | 部署位置 | 说明 |
|------|----------|------|
| Next.js 前端 + API | Vercel | 不含调度器 |
| 搜索任务调度器 | VPS | 独立进程，systemd 服务 `hirelix-scheduler` |

生产域名：`hirelix.online`（DNS A 记录指向 Vercel）

### 调度器部署

调度器代码位于 `scheduler/` 目录。

#### 部署步骤

```bash
# 1. 同步 scheduler/ 目录（及其他改动的源码）
rsync -az \
  -e 'ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222' \
  /Users/noah/projects/hirelix/scheduler/ root@66.42.53.127:/opt/hirelix/scheduler/

# 2. 如有新 npm 依赖，在 VPS 上安装
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222 root@66.42.53.127 'cd /opt/hirelix && npm install'

# 3. 重启调度器
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222 root@66.42.53.127 'systemctl restart hirelix-scheduler'
```

**环境变量**：`/etc/hirelix.env`（systemd EnvironmentFile，包含所有生产环境变量）

### 服务管理

```bash
# 查看状态
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222 root@66.42.53.127 'systemctl status hirelix-scheduler --no-pager'

# 重启服务
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222 root@66.42.53.127 'systemctl restart hirelix-scheduler'

# 查看日志
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222 root@66.42.53.127 'journalctl -u hirelix-scheduler -f'

# Agents Reference

## Collaboration Rules

- 默认情况下，完成一个主要任务后应立即提交一次，避免把多个不相关改动混在同一个 commit 里。
- commit message 使用中文，清楚说明这次提交解决了什么问题或完成了什么改动。

## Test Credentials

| 环境 | 邮箱 | 密码 |
|------|------|------|
| 本地 dev / Supabase | jzh_spring@163.com | 88888888 |

> 登录方式：邮箱 + 密码（不是 Google OAuth）

## Dev Server

```bash
SEARCH_JOB_SCHEDULER_ENABLED=true npm run dev
```

默认跑在 http://localhost:3000

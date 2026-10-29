# 冷启动能力：免费目录推广提交记录

日期：2026-10-29。已获用户明确授权填写工作邮箱、完成人机验证并提交。实际验证通过并点击提交，但目录网站自身脚本报错，未取得成功受理回执，不代表已送达、收录或产生流量。

## 渠道与当前状态

- RecruitsAgent：实际页面现要求账号登录且出现 Cloudflare 验证；未注册账号、登录或提交。旧稿的“已预填”状态不能作为当前表单状态。
- Free Recruiting Software Directory：`https://free-recruiting-software.com/submit` 实际可访问，支持 SaaS 与 Cloud-Managed。产品字段、工作邮箱、两项功能及条款均已填写；Chrome 可见 reCAPTCHA 绿色勾选及 AX Value=1，随后点击最终提交。未取得受理回执；审核通过与公开收录尚未验证。页面说明的 1–2 周审核时间不能从本次失败的提交尝试开始计算。
- 未购买广告、目录付费项目、发送营销邮件或触达候选人。

## 已准备的提交内容

- Name：Hirelix
- Type：SaaS (Software as a Service)
- Deployment：Cloud-Managed (SaaS)
- Paid plans：Yes；未填写未经本轮核验的价格。
- Website：`https://hirelix.online/?utm_source=free_recruiting_software&utm_medium=directory&utm_campaign=cold_start_20261029`
- Contact：`noah@hirelix.online`，按用户对该站的明确确认填写。
- Audience：Independent recruiters, technical recruiters and boutique search firms
- Checklist：Candidate Database、Resume Parsing

Description:

> Hirelix is a personal AI agent for independent recruiters and boutique search firms. Bring CVs and candidate exports from your computer or recruiting software into a private library, then ask the agent to research public candidate information against a job description and continue recruiting work with sources you can review.

Key features:

- Import CVs and candidate CSV exports through conversation
- Private candidate library with notes and retained sources
- Public candidate research guided by a job description
- Candidate comparison and recommendation documents
- Recruiter control over edits, sharing and outreach

该文案不承诺专有人才数据库、保证联系方式或固定人数的合格短名单。表单附注说明信息来自用户材料及公开研究、质量与可用性取决于来源。旧版“付费人才寻访”和价格文案没有复用。

## 实际阻塞及证据

1. 首次图片验证后，验证码出现“未知错误”；重载时 Chrome 控制台显示 `www.google.com/recaptcha/api.js` 的 `net::ERR_CONNECTION_CLOSED`。保留错误截图；独立网络检查随后得到 HTTP 200，正常重新加载页面后验证码恢复。
2. 恢复完整表单并再次验证，Chrome 明确显示绿色勾选、AX“进行人机身份验证” Value=1。点击 `Submit Software for Review` 后未跳转或出现成功提示。
3. Chrome 当前目录页控制台显示 `Uncaught (in promise) Error: grecaptcha.execute only works with invisible reCAPTCHA.`。栈包含该站 `a5045bab0d6550bc.js:1:5393` 的 `r.execute`、`:1:5482` 的 `r.executeAsync` 及 `:1:12399` 的提交调用；重复点击复现相同错误。没有证据支持仍是邮箱、授权或人工验证码未完成的问题。
4. 保留当前表单，没有注入 JavaScript 修改该站验证码、直接调用提交接口或绕过验证。未改本机网络、安全配置，也未以其他渠道代发申请。

本机忽略目录 `output/release-promotion-20261029/` 保留 `captcha-error.png`、`captcha-console-error.txt`、`directory-submit-script-error.txt` / `.png` 以及最终表单截图。需要目录方修复该提交脚本或提供正常的官方提交渠道后才能继续；目前推广状态是“已授权并尝试，网站错误阻塞”，不是“待用户确认”或“已发布”。

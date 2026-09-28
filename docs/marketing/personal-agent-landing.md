# Personal Agent 英文落地页

## 产品决定

- 首屏定位：Your personal AI agent for headhunting.
- 重点服务独立猎头和精品猎头公司的顾问；主标题使用 headhunting，避免把受众限定为自由职业者。
- 长期价值通过既有人选、原始材料、沟通记录与跨职位工作体现。
- 从首页移除外部 sourcing、扫描额度、自动生成候选池和对应的旧套餐；已有后台能力与订阅不在此次修改范围内。
- Personal Agent 的价格尚未确定。首页不沿用 sourcing 价格，也不承诺无限使用或免费。
- 首页固定英文，包括保存过中文产品偏好的访问者；登录后的语言偏好继续保留。

## 页面结构

1. 产品身份与工作台示意。
2. 三个可切换场景：检索自有人选、根据反馈更新职位要求、准备客户推荐。
3. 长期记录如何用于后续职位。
4. 变更审阅、客户材料选择、候选人导出与删除。
5. FAQ 与进入助理的按钮。

示意界面使用虚构人物和公司，页面明确标注。它是产品说明，不是实时 Agent、客户证言或真实业务验证结果。

主按钮进入 `/app`，未登录时显示现有登录界面；不进入付费搜寻流程。访问归因参数继续传递。新增 `personal_agent_cta_click` 区分新版转化意图。

## 本地验证

- Chrome 插件：桌面和 390px 手机预览、场景点击与键盘切换、真实登录入口。
- Playwright 使用已安装的 Chrome：桌面和 mobile-chrome 两项目，12 项通过，无请求拦截或模拟服务。检查 360/390/768/1440px 布局、FAQ、场景、英文语言边界、CTA 路由与归因。
- 浏览器测试验证到实际登录表单，不代表已重新验证 Google OAuth 或登录后 Agent 的完整业务链路。
- 增长事件与参与时长回归：7 项通过。
- 生产构建、TypeScript、修改文件 ESLint 检查通过。
- 截图保存在本地忽略目录 `output/landing-agent/`。
- 未部署生产，未执行外部 sourcing，未更改现有计费或订阅。

复现浏览器回归（已有本地服务运行时）：

```bash
PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://localhost:3000 PLAYWRIGHT_REUSE_SERVER=1 npx playwright test e2e/landing.spec.ts --workers=1 --reporter=line --retries=0
```

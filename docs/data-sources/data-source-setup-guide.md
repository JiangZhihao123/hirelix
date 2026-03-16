# Hirelix 数据源设置指南

**最终方案**：Serper + Proxycurl + Hunter.io

**总成本**：
- Serper：免费（已有）
- Proxycurl：$10 起步（测试）
- Hunter.io：$49/月（或免费 25 次/月）
- **初始成本：$10-59**

---

## 步骤 1：Serper.dev（已完成）

✅ **你已经有 Serper API Key 了**

**确认**：
- 检查 `.env` 文件中的 `SERPER_API_KEY`
- 免费额度：2,500 次/月
- 无需额外操作

---

## 步骤 2：Proxycurl 注册

### 2.1 注册账户

1. **访问**：https://nubela.co/proxycurl/
2. **点击**："Sign Up" 或 "Get Started"
3. **填写信息**：
   - Email
   - Password
   - Company Name（可选）
4. **验证邮箱**

### 2.2 获取 API Key

1. **登录后**，进入 Dashboard
2. **找到**："API Keys" 或 "Settings"
3. **复制** API Key
4. **保存**到安全的地方

### 2.3 选择计划

**推荐：Pay-as-you-go（按用量付费）**

1. **进入**："Billing" 或 "Pricing"
2. **选择**："Pay as you go"
3. **充值**：$10（100 credits）
   - 可以用信用卡
   - 支持 Stripe 支付
4. **无月费**，用多少付多少

**或者：月订阅（如果用量大）**
- $49/月：2,500 credits
- 但建议先用 Pay-as-you-go 测试

### 2.4 配置环境变量

**添加到 `.env` 文件**：
```bash
PROXYCURL_API_KEY=your_proxycurl_api_key_here
```

**添加到 Vercel 环境变量**：
1. 进入 Vercel Dashboard
2. 选择 hirelix 项目
3. Settings → Environment Variables
4. 添加：
   - Key: `PROXYCURL_API_KEY`
   - Value: `your_proxycurl_api_key_here`
   - Environment: Production, Preview, Development

---

## 步骤 3：Hunter.io 注册

### 3.1 注册账户

1. **访问**：https://hunter.io/
2. **点击**："Sign Up Free"
3. **填写信息**：
   - Email
   - Password
   - First Name / Last Name
4. **验证邮箱**

### 3.2 获取 API Key

1. **登录后**，进入 Dashboard
2. **点击右上角**：你的头像 → "API"
3. **复制** API Key
4. **保存**到安全的地方

### 3.3 选择计划

**免费版（推荐先用这个测试）**：
- 25 次邮箱搜索/月
- 50 次邮箱验证/月
- 完全免费
- **足够测试**

**付费版（如果需要更多）**：
- Starter：$49/月（500 次搜索）
- Growth：$149/月（5,000 次搜索）
- 建议先用免费版测试

### 3.4 配置环境变量

**添加到 `.env` 文件**：
```bash
HUNTER_API_KEY=your_hunter_api_key_here
```

**添加到 Vercel 环境变量**：
1. 进入 Vercel Dashboard
2. 选择 hirelix 项目
3. Settings → Environment Variables
4. 添加：
   - Key: `HUNTER_API_KEY`
   - Value: `your_hunter_api_key_here`
   - Environment: Production, Preview, Development

---

## 步骤 4：测试 API

### 4.1 测试 Proxycurl

**创建测试脚本**：`scripts/test-proxycurl.js`

```javascript
const PROXYCURL_API_KEY = process.env.PROXYCURL_API_KEY;

async function testProxycurl() {
  const response = await fetch('https://nubela.co/proxycurl/api/v2/linkedin', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${PROXYCURL_API_KEY}`
    },
    params: {
      url: 'https://www.linkedin.com/in/williamhgates'
    }
  });
  
  const data = await response.json();
  console.log('Proxycurl Test:', data);
}

testProxycurl();
```

**运行**：
```bash
node scripts/test-proxycurl.js
```

### 4.2 测试 Hunter.io

**创建测试脚本**：`scripts/test-hunter.js`

```javascript
const HUNTER_API_KEY = process.env.HUNTER_API_KEY;

async function testHunter() {
  const response = await fetch(
    `https://api.hunter.io/v2/email-finder?domain=microsoft.com&first_name=Bill&last_name=Gates&api_key=${HUNTER_API_KEY}`
  );
  
  const data = await response.json();
  console.log('Hunter Test:', data);
}

testHunter();
```

**运行**：
```bash
node scripts/test-hunter.js
```

---

## 步骤 5：集成到 Hirelix

### 5.1 创建 Proxycurl 客户端

**文件**：`src/lib/proxycurl.ts`

```typescript
export async function getLinkedInProfile(linkedinUrl: string) {
  const apiKey = process.env.PROXYCURL_API_KEY;
  
  const response = await fetch(
    `https://nubela.co/proxycurl/api/v2/linkedin?url=${encodeURIComponent(linkedinUrl)}`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`Proxycurl API error: ${response.status}`);
  }
  
  return response.json();
}
```

### 5.2 创建 Hunter.io 客户端

**文件**：`src/lib/hunter.ts`

```typescript
export async function findEmail(firstName: string, lastName: string, domain: string) {
  const apiKey = process.env.HUNTER_API_KEY;
  
  const response = await fetch(
    `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${firstName}&last_name=${lastName}&api_key=${apiKey}`
  );
  
  if (!response.ok) {
    throw new Error(`Hunter API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.data?.email || null;
}
```

### 5.3 更新搜索 Pipeline

**文件**：`src/app/(product)/api/search/create/route.ts`

**修改流程**：
```typescript
// 1. Serper 搜索 LinkedIn URL（已有）
const linkedinUrls = await serperSearch(query);

// 2. Proxycurl 获取详细资料（新增）
const profiles = await Promise.all(
  linkedinUrls.map(url => getLinkedInProfile(url))
);

// 3. Hunter.io 查找邮箱（新增）
const candidates = await Promise.all(
  profiles.map(async (profile) => {
    const email = await findEmail(
      profile.first_name,
      profile.last_name,
      profile.company_domain
    );
    
    return {
      name: `${profile.first_name} ${profile.last_name}`,
      headline: profile.headline,
      location: profile.location,
      skills: profile.skills || [],
      experience_years: calculateExperience(profile.experiences),
      profile_url: profile.linkedin_url,
      email: email,
      // ... 其他字段
    };
  })
);

// 4. Claude 分析评分（已有）
// 5. 生成邮件（已有）
```

---

## 步骤 6：成本监控

### 6.1 Proxycurl 成本监控

**Dashboard**：
- 登录 Proxycurl
- 查看 "Usage" 或 "Billing"
- 监控 credits 使用情况

**设置预算提醒**：
- 设置每月预算上限
- 接近上限时收到邮件提醒

### 6.2 Hunter.io 成本监控

**Dashboard**：
- 登录 Hunter.io
- 查看 "API" → "Usage"
- 监控搜索次数

**免费版限制**：
- 25 次/月
- 超过需要升级

---

## 完整的环境变量清单

**`.env` 文件**：
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI
ANTHROPIC_API_KEY=your_anthropic_api_key

# Data Sources
SERPER_API_KEY=your_serper_api_key
PROXYCURL_API_KEY=your_proxycurl_api_key
HUNTER_API_KEY=your_hunter_api_key
```

**Vercel 环境变量**：
- 同上，全部添加到 Vercel

---

## 预计时间和成本

### 注册时间

- Proxycurl：5 分钟
- Hunter.io：5 分钟
- 配置环境变量：5 分钟
- **总计：15 分钟**

### 初始成本

- Proxycurl：$10（100 credits，测试用）
- Hunter.io：$0（免费 25 次/月）
- **总计：$10**

### 测试成本

- 测试 10 次搜索 × 15 人 = 150 条
- Proxycurl：150 × $0.01 = $1.50
- Hunter.io：免费（25 次内）
- **总计：$1.50**

---

## 常见问题

### Q1: Proxycurl 和 Hunter.io 都需要信用卡吗？

**Proxycurl**：
- 是的，需要信用卡充值
- 最低 $10

**Hunter.io**：
- 免费版不需要信用卡
- 付费版需要

### Q2: 如果 API 调用失败怎么办？

**降级策略**：
1. Proxycurl 失败 → 只用 Serper 数据（无详细资料）
2. Hunter.io 失败 → 无邮箱（只有 LinkedIn URL）
3. 告知用户数据不完整

### Q3: 如何控制成本？

**方法**：
1. 设置每月预算上限
2. 免费版限制搜索次数（3 次/月）
3. 付费版按月收费（可控）
4. 监控 API 使用情况

---

## 下一步

1. ✅ 注册 Proxycurl（5 分钟）
2. ✅ 注册 Hunter.io（5 分钟）
3. ✅ 配置环境变量（5 分钟）
4. ✅ 测试 API（10 分钟）
5. ✅ 集成到 Hirelix（1-2 天）
6. ✅ 测试完整流程（1 天）
7. ✅ 找用户验证（1 周）

**总时间**：约 2 周

---

## 联系方式

**Proxycurl**：
- 网站：https://nubela.co/proxycurl/
- 文档：https://nubela.co/proxycurl/docs
- 支持：support@nubela.co

**Hunter.io**：
- 网站：https://hunter.io/
- 文档：https://hunter.io/api-documentation
- 支持：https://hunter.io/help

**Serper**：
- 网站：https://serper.dev/
- 文档：https://serper.dev/docs
- 支持：support@serper.dev

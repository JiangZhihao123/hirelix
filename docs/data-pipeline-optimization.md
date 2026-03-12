# Hirelix 数据流程优化方案

## 概述

本文档记录了 Hirelix 候选人搜索和数据获取的优化流程，通过 Claude AI 辅助过滤，大幅减少 Apollo.io API 调用次数，降低成本并提高候选人质量。

---

## 优化前的流程

```
Serper 搜索 → 50-100 个 LinkedIn URL
↓
Apollo.io People Match → 40-80 次 API 调用
↓
Claude AI 评分和过滤 → 20 个候选人
```

**问题**：
- Apollo.io API 调用次数过多（40-80 次/搜索）
- 消耗大量 credits
- Basic 计划（1,000 credits/月）只能做 12-25 个搜索

---

## 优化后的流程

```
1. Serper 搜索
   ↓ 返回 50-100 个 URL + Title + Snippet
   
2. Claude AI 初步过滤（基于 Title + Snippet）
   ↓ 筛选出最相关的 25-30 个候选人
   
3. Apollo.io People Match（只调用 25-30 次）
   ↓ 获取 20-25 个完整资料（80-85% 成功率）
   
4. Claude AI 最终评分和排序
   ↓ 展示 20 个最佳候选人
```

**优势**：
- ✅ 减少 50-75% 的 Apollo.io API 调用
- ✅ 提高候选人质量（AI 预先过滤）
- ✅ Basic 计划可做 30-40 个搜索/月
- ✅ 成本可控

---

## 详细步骤

### Step 1: Serper 搜索

**输入**：
```javascript
{
  query: 'site:linkedin.com/in "Senior Full Stack Engineer" React TypeScript Node.js "San Francisco"',
  num: 100
}
```

**输出**：
```json
{
  "organic": [
    {
      "title": "Tim DeCillis - Senior Full Stack Engineer - Google",
      "link": "https://www.linkedin.com/in/tim-decillis",
      "snippet": "Senior Full Stack Engineer with 8+ years of experience in React, TypeScript, and Node.js. Currently at Google in San Francisco...",
      "position": 1
    },
    {
      "title": "John Doe - Junior Developer - Startup",
      "link": "https://www.linkedin.com/in/johndoe",
      "snippet": "Junior developer learning React...",
      "position": 2
    }
    // ... 50-100 个结果
  ]
}
```

---

### Step 2: Claude AI 初步过滤

**Prompt 模板**：
```
JD Requirements:
- Title: {job_title}
- Skills: {required_skills}
- Location: {location}
- Experience: {experience_years}+ years

Candidates from Google Search (Title + Snippet only):
{candidates_list}

Task:
1. Score each candidate 0-100 based on title and snippet only
2. Consider: job title match, skills mentioned, location, experience level
3. Return top 30 candidates as JSON array

Output format:
[
  {
    "url": "https://linkedin.com/in/...",
    "score": 95,
    "reason": "Perfect match: Senior Full Stack Engineer, React/TypeScript/Node.js, Google, San Francisco, 8+ years"
  },
  ...
]
```

**输出**：
- 30 个最相关的候选人
- 每个候选人有评分和理由
- 按分数从高到低排序

---

### Step 3: Apollo.io People Match

**只对高分候选人调用 API**：

```javascript
const topCandidates = claudeFilteredResults
  .filter(c => c.score >= 70)
  .slice(0, 30);

const fullProfiles = [];

for (const candidate of topCandidates) {
  try {
    const response = await fetch('https://api.apollo.io/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY
      },
      body: JSON.stringify({
        linkedin_url: candidate.url
      })
    });
    
    const data = await response.json();
    
    if (data.person && data.person.email) {
      fullProfiles.push({
        name: data.person.name,
        title: data.person.title,
        company: data.person.organization?.name,
        location: `${data.person.city}, ${data.person.state}`,
        email: data.person.email,
        linkedin_url: candidate.url,
        skills: data.person.skills,
        experience_years: calculateExperience(data.person.employment_history),
        preliminary_score: candidate.score
      });
    }
  } catch (error) {
    console.error(`Failed to fetch profile for ${candidate.url}:`, error);
  }
}
```

**预期结果**：
- 调用 25-30 次 API
- 获取 20-25 个完整资料（80-85% 成功率）

---

### Step 4: Claude AI 最终评分

**Prompt 模板**：
```
JD Requirements:
{full_jd_requirements}

Candidates with full profiles:
{full_profiles}

Task:
1. Score each candidate 0-100 based on complete profile
2. Consider: skills match, experience level, location, company background, career progression
3. Provide 3-4 specific matching reasons
4. Return top 20 candidates

Output format:
[
  {
    "name": "...",
    "score": 95,
    "matching_reasons": [
      "8+ years of full-stack experience exceeds 5-year requirement",
      "Expert in React, TypeScript, Node.js - all required skills",
      "Currently Senior Engineer at Google - strong technical background",
      "Located in San Francisco - perfect location match"
    ],
    ...
  },
  ...
]
```

**输出**：
- 20 个最佳候选人
- 详细的匹配分析
- 按分数排序

---

## 成本对比

### 优化前

**每个搜索**：
- Serper：1 次（$0）
- Apollo.io：40-80 次调用
- Claude AI：1 次（已有）

**成本**：40-80 credits/搜索

**Basic 计划（1,000 credits/月）**：
- 可做 12-25 个搜索/月

---

### 优化后

**每个搜索**：
- Serper：1 次（$0）
- Claude AI 初步过滤：1 次（已有）
- Apollo.io：25-30 次调用
- Claude AI 最终评分：1 次（已有）

**成本**：25-30 credits/搜索

**Basic 计划（1,000 credits/月）**：
- 可做 30-40 个搜索/月 ✅

**节省**：50-75% 的 Apollo.io credits

---

## 质量提升

### 1. 双重 AI 过滤

- **第一层**：基于 Title + Snippet 快速过滤
- **第二层**：基于完整资料深度分析

### 2. 更精准的候选人

- 排除明显不相关的人（Junior, Intern 等）
- 只对高质量候选人调用 Apollo API
- 最终候选人质量更高

### 3. 更好的用户体验

- 更快的响应时间（减少 API 调用）
- 更相关的候选人
- 更详细的匹配分析

---

## 实现注意事项

### 1. Serper 搜索优化

**使用精确匹配**：
```
site:linkedin.com/in "Senior Full Stack Engineer" 
"React" "TypeScript" "Node.js" 
"San Francisco" OR "San Francisco Bay Area"
-"Junior" -"Intern"
```

**返回足够多的结果**：
- `num: 100` 确保有足够的候选人池
- 即使 Google 只返回 50 个，也足够

### 2. Claude AI 初步过滤

**评分标准**：
- 职位匹配：30 分
- 技能匹配：30 分
- 地点匹配：20 分
- 经验匹配：20 分

**阈值设置**：
- 只保留 70+ 分的候选人
- 最多取前 30 个

### 3. Apollo.io API 调用

**错误处理**：
- 捕获 API 错误
- 记录失败的 URL
- 继续处理其他候选人

**成功率**：
- 预期 80-85% 成功率
- 30 次调用 → 24-26 个成功

### 4. Claude AI 最终评分

**详细分析**：
- 提供 3-4 条具体匹配理由
- 考虑完整的职业背景
- 评估技能深度和广度

---

## 监控和优化

### 关键指标

1. **Apollo.io API 调用次数**
   - 目标：25-30 次/搜索
   - 监控：每次搜索记录实际调用次数

2. **候选人质量**
   - 目标：最终 20 个候选人平均分 80+
   - 监控：用户反馈和录用率

3. **成本效率**
   - 目标：每月 30-40 个搜索
   - 监控：credits 消耗情况

### 持续优化

1. **调整 Claude AI 过滤阈值**
   - 如果候选人太少，降低阈值到 60 分
   - 如果质量不够，提高阈值到 80 分

2. **优化 Serper 搜索查询**
   - 测试不同的关键词组合
   - 使用更精确的匹配

3. **改进 Prompt**
   - 根据用户反馈调整评分标准
   - 优化匹配理由的生成

---

## 总结

**优化效果**：
- ✅ 减少 50-75% Apollo.io API 调用
- ✅ 提高候选人质量
- ✅ 降低成本（每月可做 30-40 搜索）
- ✅ 更好的用户体验

**下一步**：
1. 等待 Apollo.io 客服确认 API 限制
2. 实现优化后的流程
3. 测试和调优
4. 上线生产环境

---

**文档版本**：v1.0  
**最后更新**：2025-01-10  
**作者**：Hirelix Team

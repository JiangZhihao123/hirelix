# Serper vs Bright Data 数据源对比总结

## 测试概况
- **测试时间**：2026-03-17
- **测试 JD**：Full Stack Engineer (US)
- **目标召回**：各 100 条 LinkedIn 简历
- **测试轮次**：3 轮

---

## 核心发现

### 1️⃣ 候选人产出量

| 轮次 | Bright 产出 | Serper 产出 | 胜者 |
|------|-------------|-------------|------|
| 第1轮 | 0 | 50 | **Serper** |
| 第2轮 | 50 | 50 | 平局 |
| 第3轮 | 1 | 15 | **Serper** |

**结论**：Serper 在 3 轮测试中 2 次明显胜出，Bright 有 2 次几乎没产出（0 和 1）。

---

### 2️⃣ 稳定性

| 数据源 | 状态分布 | 召回状态 |
|--------|----------|----------|
| **Bright** | 3 次全部 `degraded` | `submitted` / `polling`（卡住） |
| **Serper** | 2 次 `degraded`，1 次 `done` | N/A（实时） |

**结论**：Bright 的 dataset 召回机制不稳定，经常卡在 `submitted` 或 `polling` 状态，导致最终产出极少甚至为 0。

---

### 3️⃣ 响应速度

| 轮次 | Bright 耗时 | Serper 耗时 | 快多少 |
|------|-------------|-------------|--------|
| 第1轮 | 317s | 21s | **15x** |
| 第2轮 | 48s | 25s | **2x** |
| 第3轮 | 655s | 565s | 1.2x |

**结论**：Serper 在前两轮明显更快（2-15 倍），第 3 轮两者都慢（可能是 LLM 深度评审导致），但 Serper 仍略快且产出更多。

---

### 4️⃣ 候选人质量（第 3 轮 Top 10 对比）

#### Bright（仅 1 人）
- **58 分** | Sri Sowmya Jonnala | at MetLife | Greater Seattle Area, US

#### Serper（15 人）
- **68 分** | Atul Choudhary | at HashedIn by Deloitte | New Delhi, Delhi, India
- **35 分** | Junsoo Park | at LG CNS | New York, NY
- **6 分** | Chris Scrivo | at IQVIA | New York, NY
- **6 分** | Yi-Ting Hsieh | at DEVA | New York, NY
- **5 分** | Isha Satoor | at ExaCare AI | NYC
- **5 分** | Brennan Skinner | at Descriptive | Brooklyn, NY
- 其余 4-2 分

**结论**：
- Serper 的 Top 1 得分更高（68 vs 58）
- Serper 提供了 15 个候选人，Bright 只有 1 个
- Serper 的地域覆盖更广（NY, India, Seattle 等）

---

### 5️⃣ 召回效率

#### Serper（第 3 轮）
- 检索了 100 条原始结果
- Source rule 通过率：15%（15 人）
- LLM prescreen 通过率：6%（6 人）
- 最终产出：15 人

#### Bright（第 3 轮）
- 请求了 dataset snapshot：`snap_mmuzzg43120iv69klf`
- 过滤条件：7 个职位变体 + US 国家码
- 召回状态：`polling`（卡住）
- 最终产出：1 人

**结论**：Bright 的 dataset 机制在这次测试中几乎完全失效。

---

## 决策建议

### ✅ 推荐：Serper

**理由**：
1. **稳定性**：3 轮测试中 2 次正常产出，1 次完成（done）
2. **产出量**：平均每轮 38 人，Bright 平均 17 人（且有 2 次几乎为 0）
3. **速度**：前两轮快 2-15 倍，第 3 轮也略快
4. **质量**：Top 候选人得分更高（68 vs 58）
5. **实时性**：不依赖异步 dataset，不会卡在 polling 状态

### ⚠️ Bright 的问题

1. **Dataset 召回不稳定**：3 次测试中 2 次几乎没产出（0 和 1）
2. **异步机制易卡死**：`submitted` → `polling` 经常超时或返回空
3. **过滤逻辑可能过严**：即使有 100 条 dataset，最终只产出 1 人

---

## 后续行动

1. **立即切换到 Serper**：设置 `SEARCH_RECALL_PROVIDER=serper`
2. **保留 Bright 作为备选**：仅在 Serper 失败时降级使用
3. **监控 Serper 成本**：记录每次搜索的 API 调用量和费用
4. **优化 Serper 查询**：根据 `serper_query_tier_stats` 调整 P0/P1 查询策略

---

## 附录：测试文件

- [data-source-comparison-1773773520579.json](data-source-comparison-1773773520579.json)
- [data-source-comparison-1773774553378.json](data-source-comparison-1773774553378.json)
- [data-source-comparison-1773776461514.json](data-source-comparison-1773776461514.json)
- [scripts/compare-data-sources.ts](scripts/compare-data-sources.ts)

# Hirelix 流水线架构设计方案

## 当前架构问题

### 串行处理流程
```
JD 解析 → Serper 搜索 → AI Pre-screen → Bright Data 抓取 → AI 深度评分 → 存储
  ↓           ↓              ↓                ↓                  ↓
等待完成    等待完成       等待完成         等待全部完成        等待全部完成
```

**问题：**
1. 资源浪费：Bright Data 抓取时，AI 闲置；AI 评分时，Bright Data 闲置
2. 用户等待：必须等所有步骤完成才能看到结果
3. 反馈延迟：155 个 profiles 需要 3-4 分钟才能看到第一个候选人

## 流水线架构设计

### 核心理念：生产者-消费者模式

```
[Bright Data Producer]
  ↓ 完成 batch 1 (30 profiles)
[Channel/Queue]
  ↓ 立即消费
[AI Scoring Consumer] ← 并行处理
  ↓ 评分完成 batch 1
[Database Writer]
  ↓ 用户立即可见
  
同时：
[Bright Data Producer]
  ↓ 完成 batch 2 (30 profiles)
[Channel/Queue]
  ↓ 立即消费
[AI Scoring Consumer] ← 并行处理
  ...
```

### 架构组件

#### 1. Bright Data Stream Producer

```typescript
async function* streamBrightDataProfiles(
  apiToken: string,
  datasetId: string,
  linkedinUrls: string[],
  options: BrightDataScrapeOptions = {}
): AsyncGenerator<BrightDataProfile[], void, unknown> {
  const batches = chunkArray(linkedinUrls, options.batchSize ?? 30);
  
  // 并发触发所有批次
  const snapshotPromises = batches.map(async (urls, index) => {
    const snapshotId = await triggerScrape(apiToken, datasetId, urls);
    return { snapshotId, batchIndex: index };
  });
  
  // 边完成边 yield
  for (const promise of snapshotPromises) {
    const { snapshotId } = await promise;
    const profiles = await pollSnapshot(apiToken, snapshotId, 12, 10000);
    yield profiles; // 立即返回这一批
  }
}
```

#### 2. AI Scoring Stream Consumer

```typescript
async function* streamScoredCandidates(
  context: SearchContext,
  parsed: Record<string, unknown>,
  profileStream: AsyncGenerator<BrightDataProfile[]>,
  retrievalCount: number
): AsyncGenerator<DbCandidate[], void, unknown> {
  for await (const profileBatch of profileStream) {
    // 立即评分这一批
    const scored = await scoreBatch(context, parsed, profileBatch);
    yield scored; // 立即返回评分结果
  }
}
```

#### 3. Database Stream Writer

```typescript
async function streamWriteCandidates(
  searchId: string,
  candidateStream: AsyncGenerator<DbCandidate[]>
): Promise<void> {
  for await (const candidateBatch of candidateStream) {
    // 立即写入数据库
    await supabase
      .from('hirelix_candidates')
      .insert(candidateBatch);
    
    // 触发前端实时更新（WebSocket/SSE）
    await notifyFrontend(searchId, candidateBatch);
  }
}
```

### 完整流水线

```typescript
async function runPipelineSearch(
  context: SearchContext,
  parsed: Record<string, unknown>,
  preScreened: PreScreenedCandidate[],
  retrievalCount: number
) {
  const urlsToScrape = preScreened.map(c => c.serperCandidate.linkedin_url);
  
  // 1. 启动 Bright Data 流
  const profileStream = streamBrightDataProfiles(
    brightDataToken,
    brightDataDatasetId,
    urlsToScrape,
    { batchSize: 30, concurrency: 20 }
  );
  
  // 2. 启动 AI 评分流（消费 profiles）
  const candidateStream = streamScoredCandidates(
    context,
    parsed,
    profileStream,
    retrievalCount
  );
  
  // 3. 启动数据库写入流（消费 candidates）
  await streamWriteCandidates(context.searchId, candidateStream);
}
```

## 性能提升预估

### 当前架构（串行）
- Bright Data 抓取：2-3 分钟（155 profiles）
- AI 评分：1-2 分钟（155 profiles）
- **总时间：3-5 分钟**
- **第一个候选人出现：3-5 分钟**

### 流水线架构（并行）
- Bright Data batch 1 完成：30 秒
- AI 评分 batch 1：20 秒
- **第一个候选人出现：50 秒**（提升 **4-6 倍**）
- **总时间：2-3 分钟**（提升 **40-50%**）

## 前端实时更新

### Server-Sent Events (SSE)

```typescript
// API Route: /api/search/[id]/stream
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 订阅候选人更新
      const subscription = subscribeToCandidateUpdates(searchId);
      
      for await (const candidates of subscription) {
        const data = `data: ${JSON.stringify(candidates)}\n\n`;
        controller.enqueue(encoder.encode(data));
      }
      
      controller.close();
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

### 前端消费

```typescript
// 搜索结果页面
useEffect(() => {
  const eventSource = new EventSource(`/api/search/${searchId}/stream`);
  
  eventSource.onmessage = (event) => {
    const newCandidates = JSON.parse(event.data);
    setCandidates(prev => [...prev, ...newCandidates]);
  };
  
  return () => eventSource.close();
}, [searchId]);
```

## 实现步骤

### Phase 1: 后端流水线（核心）
1. ✅ 修改 `scrapeLinkedInProfiles` 为 Async Generator
2. ✅ 修改 `scoreBrightDataProfiles` 为流式处理
3. ✅ 实现流式数据库写入
4. ✅ 测试流水线性能

### Phase 2: 实时更新（增强体验）
1. ✅ 实现 SSE API endpoint
2. ✅ 前端订阅候选人更新
3. ✅ 实时进度条更新
4. ✅ 测试实时更新

### Phase 3: 优化和监控
1. ✅ 添加流水线监控指标
2. ✅ 错误处理和重试机制
3. ✅ 性能调优
4. ✅ 生产环境测试

## 技术挑战

### 1. 错误处理
- 某一批次失败不应影响其他批次
- 需要 `allowPartial: true` 支持
- 记录失败的 profiles 供后续重试

### 2. 并发控制
- Bright Data 可能有并发限制
- AI API 可能有速率限制
- 需要动态调整并发度

### 3. 状态管理
- 搜索状态：`processing` vs `partial_complete` vs `done`
- 进度跟踪：已完成 / 总数
- 前端需要知道是否还有更多候选人

### 4. 数据一致性
- 确保候选人不重复
- 确保评分顺序正确
- 数据库事务处理

## 备选方案

### 方案 A：完全流水线（推荐）
- 优势：最快反馈，最佳体验
- 劣势：实现复杂度高
- 适用：生产环境

### 方案 B：批次流水线（折中）
- 每 2-3 批完成后开始评分
- 优势：实现简单，性能提升明显
- 劣势：反馈稍慢
- 适用：快速迭代

### 方案 C：保持当前架构（不推荐）
- 优势：无需修改
- 劣势：性能差，体验差
- 适用：仅用于对比

## 结论

流水线架构是 Hirelix 性能优化的关键，建议优先实现 **方案 B（批次流水线）**：
- 实现复杂度适中
- 性能提升显著（40-50%）
- 用户体验改善明显
- 可逐步演进到方案 A

---

**设计者：** AI Assistant  
**日期：** 2026-03-16  
**状态：** 设计完成，待实现

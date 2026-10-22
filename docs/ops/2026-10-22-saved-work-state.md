# 返回对话时准确显示成果状态

## 真实观察

在查看方案、返回 Pinecrest 对话的 Chrome 链路中，已完成推荐稿会先显示 Prepared work / Preparing…，随后才变成已保存成果。组件在尚未读到 job 时直接走了“正在准备”的默认分支，无法区分读取状态和实际执行；首次读取失败时还会无期限每 2.5 秒轮询。

## 修改

`AssistantWork` 首次读取显示 Loading saved work…，明确 queued 才显示 Queued、running 才显示 Preparing…。请求失败显示 Needs attention 及现有重试入口，初次读取失败不自动持续轮询；实际排队/运行任务仍轮询。已确认对应导出成果的回执无需再读一次相同文档才能隐藏重复成果卡，实际文档卡保留自己的读取和错误处理。

没有改变任务、成果、账单或模型逻辑，没有新增工作流。中文文案同步补齐。

## 验证边界

- 本机 Chrome 重新加载真实 QA 对话 `c05bc5ac-d41b-4642-8e8a-cc3847ad04b5`，读取后显示 Saved version 2、导出和 Quinn 原始 CV 附件，可继续在同一输入框工作。没有重新生成成果或发送消息。截图 `tmp/saved-work-return.png`。
- 初始状态的实际组件静态渲染显示 Loading saved work…，不含 Preparing…。这是组件渲染检查，未用它替代真实 API/浏览器结果；本轮未在真实浏览器人为制造网络故障，错误恢复分支为代码检查范围。
- `npx tsc --noEmit`、`npm run lint`、`git diff --check` 通过。`npm run test:unit` 505 项，490 通过、15 门控跳过、0 失败。此次为状态显示和读取行为调整，未增加复刻分支的单测。

未推送、部署、付款或外发；未修改 Owen 选项、既有提醒和 QA 库资料。不能由本轮验证推断生产或续费意愿已经通过。

# 编码规范

本文档定义 Hirelix 项目的开发规范，所有贡献者应遵循。

## 文件大小

- **目标**：每个文件 500 行以内
- **硬限制**：超过 800 行必须拆分
- 拆分优先级：先提取类型定义 → 工具函数 → 子组件 → 业务逻辑模块

## 组件规范

### 命名

- 组件文件：**PascalCase**（如 `CandidateCard.tsx`）
- 工具函数文件：**kebab-case**（如 `display-name.ts`）
- 变量/函数：**camelCase**
- 常量：**UPPER_SNAKE_CASE**
- 类型/接口：**PascalCase**

### 组织

- 一个文件一个组件（除非子组件仅在父组件内使用且很小）
- **页面级子组件**放在同级 `_components/` 目录（`_` 前缀避免被 Next.js App Router 识别为路由）
- **跨页面共享组件**放在 `src/components/`
- 按功能域分子目录：`src/components/auth/`、`src/components/search/` 等

### 导入顺序

```tsx
// 1. React / Next.js
import { useState } from "react";
import Link from "next/link";

// 2. 外部包
import { z } from "zod";

// 3. 内部组件
import { ScoreBadge } from "@/components/search/ScoreBadge";

// 4. 内部工具库
import { sanitizeDisplayName } from "@/lib/display-name";
```

## Lib 模块规范

### 组织

- 单一职责：每个文件负责一个明确的功能域
- 相关文件可组成子目录（如 `src/lib/search/`），通过 `index.ts` 重导出公共 API
- 类型定义与实现放在同一模块目录下的 `types.ts` 中

### 导出

- 只导出外部需要的符号
- 内部实现函数不加 `export`
- 子目录模块通过 `index.ts` 控制公共 API 表面

## 测试规范

- 每个新的 `src/lib/` 模块必须有对应的测试文件在 `tests/` 目录
- 测试文件命名：`{module-name}.test.ts`
- 使用 Node.js 原生 test runner（`node:test`）
- E2E 测试放在 `e2e/` 目录，使用 Playwright

## 脚本规范

`scripts/` 目录按用途分类：

| 子目录 | 用途 | 示例 |
|--------|------|------|
| `debug/` | 问题诊断、数据检查 | `check-failed-search.ts` |
| `integration/` | 外部 API 集成验证（手动运行） | `test-bright-10.ts` |
| `pipeline/` | 搜索流水线测试与度量 | `test-full-pipeline.js` |
| `tools/` | 一次性工具脚本 | `gen-images.js` |

新脚本必须放入对应子目录，不允许在 `scripts/` 根目录放文件。

## AI/LLM 使用原则

- **禁止用正则处理核心文本理解问题**（详见 AGENTS.md）
- 正则只用于格式严格的字符串（日期、URL、邮箱）
- 自然语言文本的清洗、判断、分类、提取必须调用 LLM

## Git 规范

- **提交频率**：完成一个主要任务后立即提交，避免混合不相关改动
- **Commit message**：使用中文，清楚说明解决了什么问题或完成了什么改动
- **分支策略**：主分支 `main`，功能开发在 feature 分支

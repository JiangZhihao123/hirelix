# Hirelix Docs

This directory is the home for project documentation.

## Structure

### Product

- [`product/personal-agent-core-scenarios.md`](./product/personal-agent-core-scenarios.md): 猎头 Personal Agent 的八个核心场景与设计原则
- [`product/personal-agent-architecture-and-interaction.md`](./product/personal-agent-architecture-and-interaction.md): 基于五项 Agent 能力支撑八个场景的架构与交互方案 v3（JD/简历检索优先，简化记忆与执行机制，稳定可维护优先；具体实现待评审）

### Strategy

- [`strategy/product-strategy.md`](./strategy/product-strategy.md): the core product strategy and stage-by-stage growth logic

### Architecture

- [`architecture/data-pipeline-optimization.md`](./architecture/data-pipeline-optimization.md): candidate search and enrichment flow optimization

### Data Sources

- [`data-sources/data-source-strategy.md`](./data-sources/data-source-strategy.md): overall data-source strategy and decision notes
- [`data-sources/data-source-final-comparison.md`](./data-sources/data-source-final-comparison.md): final provider comparison
- [`data-sources/apollo-vs-proxycurl-comparison.md`](./data-sources/apollo-vs-proxycurl-comparison.md): detailed Apollo vs Proxycurl comparison
- [`data-sources/data-source-setup-guide.md`](./data-sources/data-source-setup-guide.md): setup guide for the chosen stack

### Growth

- [`growth/growth-plan-24-months.md`](./growth/growth-plan-24-months.md): 24-month growth and fundraising plan
- [`growth/conversion-funnel-v1.md`](./growth/conversion-funnel-v1.md): conversion event taxonomy and landing-page experiment definitions
- [`growth/ads-funnel-roi-model.md`](./growth/ads-funnel-roi-model.md): paid-acquisition funnel psychology, conversion assumptions, and first-month ROI model

### Competitive Analysis

- [`competitive-analysis/competitive-analysis-2026.md`](./competitive-analysis/competitive-analysis-2026.md): 2026 独立深度竞品分析（JTBD 切赛道、SWOT 与攻防剧本、单位经济学、ICE 行动清单）
- [`competitive-analysis/competitive-landscape.md`](./competitive-analysis/competitive-landscape.md): v1.0 广覆盖市场扫描

### Launch

- [`launch/paid-beta-readiness.md`](./launch/paid-beta-readiness.md): paid beta launch checklist, rollout order, and production verification notes
- [`launch/real-role-validation.md`](./launch/real-role-validation.md): design-partner validation playbook for real technical recruiter roles

### Marketing

- [`marketing/reddit-post.md`](./marketing/reddit-post.md): Reddit launch copy

### Conventions

- [`conventions.md`](./conventions.md): 编码规范（文件大小、命名、组件组织、测试、Git 等）

## Meta

- Keep product, engineering, strategy, and marketing docs in `docs/`
- Prefer grouped subdirectories over adding new Markdown files at the repository root
- Reserve the repository root `README.md` for project onboarding and links to deeper docs

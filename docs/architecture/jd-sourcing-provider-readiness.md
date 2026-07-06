# Sourcing Provider Readiness Report

本报告只检查本地 provider 配置状态。未传 `--network` 时不会访问外部服务；传 `--network` 时 Bright 只读查询余额，不创建 snapshot。

## Summary

- Network checked：yes
- Providers：6
- Ready：6
- Warning：0
- Missing：0
- Error：0
- Required failures：0
- Optional unusable：0
- Usable for no-Bright benchmark：yes

## Providers

| Provider | Required | Usable | Status | Message |
| --- | --- | --- | --- | --- |
| deepseek | yes | yes | ready | DEEPSEEK_API_KEY is configured |
| serper | yes | yes | ready | SERPER_API_KEY is configured |
| exa | no | yes | ready | EXA_API_KEY is configured |
| firecrawl | no | yes | ready | FIRECRAWL_API_KEY is configured |
| github | no | yes | ready | GITHUB_TOKEN is configured |
| bright | no | yes | ready | Bright balance is $8.96 |

# DeepSeek V4 tokenizer

`deepseek-v4.json` is the unchanged `tokenizer.json` from the official archive
linked by https://api-docs.deepseek.com/quick_start/token_usage/:
https://cdn.deepseek.com/api-docs/deepseek_v4_tokenizer.zip (retrieved 2026-10-29).

SHA-256: `89085f12ef79460ac5f66d1119325ddfc694b4ab209d80bbd81d35f081dc9614`.

Used only on the server for the supported official DeepSeek V4 models. Prompt
and tool schema JSON is tokenized locally, with 20% + 512 tokens reserved for
chat/tool protocol overhead. The estimate is checked against real API usage in
QA; provider-reported usage remains the settlement authority. No tokenizer is
downloaded at runtime. File tracing includes this asset in the deployed server.

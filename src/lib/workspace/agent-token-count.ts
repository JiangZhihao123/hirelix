import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Tokenizer } from "@huggingface/tokenizers";

// Official V4 tokenizer linked from DeepSeek's Token Usage documentation.
// Count serialized prompt + schemas, including escaped data, then reserve
// protocol headroom. This is an estimate, never the settled provider usage.
let tokenizer: Promise<Tokenizer> | undefined;
export async function estimateDeepSeekInputTokens(prompt: unknown, tools: unknown) {
  tokenizer ??= readFile(join(process.cwd(), "src/assets/tokenizers/deepseek-v4.json"), "utf8")
    .then(source => new Tokenizer(JSON.parse(source), {}));
  const encoded = (await tokenizer).encode(JSON.stringify({prompt, tools})).ids.length;
  return {tokenized: encoded, reserved: Math.ceil(encoded * 1.2) + 512, method: "deepseek-v4-tokenizer-json+20%+512"};
}

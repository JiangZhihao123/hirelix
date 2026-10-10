/** Decode the provider's SSE transport, never reasoning or tool payloads. */
export async function readCompletionStream(response: Response, onText: (text: string) => Promise<void>) {
  if (!response.body) throw new Error("LLM stream has no body");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", text = "", usage: unknown, finished = false, finishReason: string | undefined;
  const line = async (value: string) => {
    if (!value.startsWith("data:")) return;
    const data = value.slice(5).trim();
    if (data === "[DONE]") { finished = true; return; }
    if (!data) return;
    const event = JSON.parse(data);
    if (event.error) throw new Error("LLM stream failed");
    if (event.usage) usage = event.usage;
    if (typeof event.choices?.[0]?.finish_reason === "string") finishReason = event.choices[0].finish_reason;
    const delta = event.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta) { text += delta; await onText(text); }
  };
  try {
    while (!finished) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, {stream: !chunk.done});
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) { await line(buffer.slice(0,end).replace(/\r$/, "")); buffer = buffer.slice(end+1); }
      if (chunk.done) { if (buffer) await line(buffer); break; }
    }
    if (!finished) throw new Error("LLM stream ended before completion");
    if (!usage) throw new Error("LLM stream returned no usage");
    return {choices: [{message: {content: text}, ...(finishReason ? {finish_reason: finishReason} : {})}], usage};
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Only the top-level answer string is displayable; JSON property order is not
 * guaranteed by the provider. Nested action/source strings are never prose. */
export function partialAnswer(json: string): string {
  if (!json.trimStart().startsWith("{")) return "";
  let depth = 0, answerStart = -1;
  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (char === "{") depth++;
    else if (char === "}" || char === "]") depth--;
    else if (char === "[") depth++;
    else if (char === '"') {
      const start = i;
      let escaped = false;
      for (i++; i < json.length; i++) {
        if (json[i] === '"' && !escaped) break;
        escaped = json[i] === "\\" && !escaped;
      }
      if (i === json.length) return "";
      if (depth !== 1 || json.slice(start, i + 1) !== '"answer"') continue;
      const value = /^\s*:\s*"/.exec(json.slice(i + 1));
      if (value) { answerStart = i + 1 + value[0].length; break; }
    }
  }
  if (answerStart < 0) return "";
  let escaped = false;
  for (let i = answerStart; i < json.length; i++) {
    const char = json[i];
    if (char === '"' && !escaped) return JSON.parse('"' + json.slice(answerStart,i) + '"');
    escaped = char === "\\" && !escaped;
  }
  // Leave incomplete escapes and surrogate pairs for the next provider chunk.
  let value = json.slice(answerStart);
  for (let i = 0; i < 7 && value.length; i++, value = value.slice(0,-1)) {
    try { return (JSON.parse('"' + value + '"') as string).replace(/[\uD800-\uDBFF]$/, ""); } catch { /* incomplete JSON escape */ }
  }
  return "";
}

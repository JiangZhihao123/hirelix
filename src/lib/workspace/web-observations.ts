import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activeAgentJob } from "./agent-execution";
import { json } from "./database";
import { saveFile } from "./files";
import type { Job } from "./types";
import type { WebSource } from "./web-search";

export const WEB_PAGE_CHARACTERS = 12000;
const SEARCH_SUMMARY_CHARACTERS = 24000;
type WebTool = "web_search" | "web_fetch";
type ToolOutput = {ok: boolean; result?: Record<string, unknown>; [key: string]: unknown};
export type WebObservation = {
  tool: WebTool;
  tool_call_id: string;
  input: unknown;
  observed_at: string;
  output: ToolOutput;
};

export function webObservations(result: Job["result"]): WebObservation[] {
  return (result?.web_observations ?? []) as WebObservation[];
}

// Research observations are execution context, not saved candidate records or
// side-effect receipts. Keep original responses in existing owned file storage;
// retain the model's bounded evidence view under the job's current lease.
export async function retainWebObservation(job: Job, tool: WebTool, toolCallId: string, input: unknown, output: ToolOutput) {
  return db.transaction(async tx => {
    await activeAgentJob(job, tx, true);
    const original = await saveFile(job.user_id, {
      name: `${tool}-${toolCallId}.json`, type: "application/json",
      bytes: Buffer.from(JSON.stringify({tool, input, output})),
    }, tx);
    const originalResponse = {file_id: original.id, sha256: original.sha256,
      read_with: {file_id: original.id, offset: 0, limit: WEB_PAGE_CHARACTERS}};
    const result = output.result;
    let view = result;
    async function page(content: string, inlineLimit: number) {
      const text = content.slice(0, inlineLimit);
      if (text.length === content.length) return {content: text, truncated: false};
      const file = await saveFile(job.user_id, {
        name: `${tool}-${toolCallId}-page.txt`, type: "text/plain", bytes: Buffer.from(content),
      }, tx);
      return {content: text, truncated: true, content_characters: content.length,
        content_reference: {file_id: file.id, sha256: file.sha256,
          read_with: {file_id: file.id, offset: text.length, limit: WEB_PAGE_CHARACTERS}}};
    }
    if (output.ok && result && tool === "web_search") {
      let summaryRemaining = SEARCH_SUMMARY_CHARACTERS, contentRemaining = WEB_PAGE_CHARACTERS;
      const sources = [];
      for (const source of result.sources as WebSource[]) {
        const summary = source.summary.slice(0, Math.min(4000, summaryRemaining));
        summaryRemaining -= summary.length;
        const body = source.content ? await page(source.content, contentRemaining) : undefined;
        contentRemaining -= body?.content.length ?? 0;
        sources.push({title: source.title, href: source.href, summary,
          summary_truncated: summary.length < source.summary.length,
          publishedAt: source.publishedAt, relevance: source.relevance, authority: source.authority,
          ...body});
      }
      view = {...result, sources, original_response: originalResponse,
        read_more: "This is a bounded evidence view. Use read_file with the supplied file_id, offset and limit to read omitted text. original_response retains every returned snippet, summary and page text. Summaries are provider summaries, not original quotations."};
    } else if (output.ok && result && tool === "web_fetch") {
      view = {...result, ...await page(result.content as string, WEB_PAGE_CHARACTERS), original_response: originalResponse,
        read_more: "If truncated, read_file with content_reference.read_with reads the next original-text page without fetching or charging for the URL again."};
    }
    const observed = {...output, ...(view ? {result: view} : {})};
    const observation: WebObservation = {tool, tool_call_id: toolCallId, input, observed_at: new Date().toISOString(), output: observed};
    await tx.execute(sql`UPDATE hirelix_private_jobs SET result=jsonb_set(coalesce(result,'{}'::jsonb),'{web_observations}',coalesce(result->'web_observations','[]'::jsonb)||${json([observation])}) WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid`);
    return observed;
  });
}

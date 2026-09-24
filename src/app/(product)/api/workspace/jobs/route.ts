import { assessmentInput } from "@/lib/workspace/assessment";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { enqueue, rows } from "@/lib/workspace/database";
import { retrievalInput } from "@/lib/workspace/retrieval";
const inputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("retrieval"),
    request_key: z.string().min(1).max(200),
    payload: retrievalInput,
  }),
  z.object({
    kind: z.literal("assessment"),
    request_key: z.string().min(1).max(200),
    payload: assessmentInput,
  }),
]);
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => {
    const input = inputSchema.parse(await readBody(req));
    return {
      job: await enqueue(user.id, input.kind, input.request_key, input.payload),
    };
  });
}
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) => ({
    jobs: await rows(
      sql`SELECT id,kind,status,progress,error,result,payload,created_at,updated_at FROM hirelix_private_jobs WHERE user_id=${user.id}::uuid ORDER BY created_at DESC LIMIT 100`,
    ),
  }));
}

import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { rows, WorkspaceError } from "@/lib/workspace/database";
import { idSchema } from "@/lib/workspace/types";
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) => ({ notifications: await rows(sql`SELECT id,title,href,created_at FROM hirelix_private_notifications WHERE user_id=${user.id}::uuid AND read_at IS NULL ORDER BY created_at DESC LIMIT 20`) }));
}
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => {
    const input = await readBody(req) as {id?: unknown; conversation_id?: unknown};
    if (input.conversation_id) {
      const conversationId = idSchema.parse(input.conversation_id);
      await rows(sql`UPDATE hirelix_private_notifications SET read_at=now() WHERE user_id=${user.id}::uuid AND href=${`/app?conversation=${conversationId}`} AND read_at IS NULL`);
      return {ok:true};
    }
    const id = idSchema.parse(input.id);
    const updated = await rows(sql`UPDATE hirelix_private_notifications SET read_at=coalesce(read_at,now()) WHERE id=${id}::uuid AND user_id=${user.id}::uuid RETURNING id`);
    if (!updated.length) throw new WorkspaceError("This item was not found", 404);
    return { ok: true };
  });
}

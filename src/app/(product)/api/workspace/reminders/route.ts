import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { listReminders, reminderOverview, editReminder } from "@/lib/workspace/reminders";
export function GET(req: NextRequest) { return workspaceApi(req, async user => {
  const input = z.object({view: z.enum(["receipts", "manage"]).default("receipts"), kind: z.enum(["reminder", "search_update"]).default("reminder"), page: z.coerce.number().int().min(1).max(100000).default(1), id: z.uuid().nullable().default(null)}).parse(Object.fromEntries(req.nextUrl.searchParams));
  return input.view === "manage" ? reminderOverview(user.id, input.kind, input.page) : {reminders: await listReminders(user.id, undefined, input.id)};
}); }
export function PATCH(req: NextRequest) { return workspaceApi(req, async user => {
  return editReminder(user.id, await readBody(req));
}); }

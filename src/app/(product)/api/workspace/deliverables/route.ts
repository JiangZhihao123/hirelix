import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import {
  listDeliverables,
  prepareDeliverable,
} from "@/lib/workspace/deliverables";
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) => ({
    deliverables: await listDeliverables(user.id),
  }));
}
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => ({
    job: await prepareDeliverable(user.id, await readBody(req)),
  }));
}

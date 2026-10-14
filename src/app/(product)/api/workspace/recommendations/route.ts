import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi } from "@/lib/workspace/http";
import { recommendations } from "@/lib/workspace/recommendations";
export function GET(req: NextRequest) {
  return workspaceApi(req, user => recommendations(user.id, req.nextUrl.searchParams.has("role") ? z.uuid().parse(req.nextUrl.searchParams.get("role")) : null));
}

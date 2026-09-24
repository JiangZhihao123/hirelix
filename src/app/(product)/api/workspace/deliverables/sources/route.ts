import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi } from "@/lib/workspace/http";
import { preparationSources } from "@/lib/workspace/deliverables";
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) =>
    preparationSources(
      user.id,
      z.uuid().parse(req.nextUrl.searchParams.get("role")),
    ),
  );
}

import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { assistantOpening } from "@/lib/workspace/conversations";
import { z } from "zod";
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) => {
    const requestedRoleId = req.nextUrl.searchParams.get("role_id");
    const requestedPersonId = req.nextUrl.searchParams.get("person_id");
    return assistantOpening(
      user.id,
      req.nextUrl.searchParams.get("locale") === "zh" ? "zh" : "en",
      requestedRoleId ? z.uuid().parse(requestedRoleId) : null,
      requestedPersonId ? z.uuid().parse(requestedPersonId) : null,
    );
  });
}

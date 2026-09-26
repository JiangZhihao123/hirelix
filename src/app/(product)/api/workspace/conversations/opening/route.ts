import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { assistantOpening } from "@/lib/workspace/conversations";
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) =>
    assistantOpening(
      user.id,
      req.nextUrl.searchParams.get("locale") === "zh" ? "zh" : "en",
    ),
  );
}

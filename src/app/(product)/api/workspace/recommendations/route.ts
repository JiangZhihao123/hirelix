import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi } from "@/lib/workspace/http";
import { recommendations } from "@/lib/workspace/recommendations";
import { recommendationListOptions } from "@/lib/workspace/list-options";
import { pageRecommendations } from "@/lib/workspace/recommendations-contract";
export function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("view") === "list")
    return workspaceApi(req, async (user) => {
      const input = recommendationListOptions.parse(
        Object.fromEntries(req.nextUrl.searchParams),
      );
      return pageRecommendations(await recommendations(user.id), input);
    });
  return workspaceApi(req, (user) =>
    recommendations(
      user.id,
      req.nextUrl.searchParams.has("role")
        ? z.uuid().parse(req.nextUrl.searchParams.get("role"))
        : null,
    ),
  );
}

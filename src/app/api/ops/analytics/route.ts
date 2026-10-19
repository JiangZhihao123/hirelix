import { NextRequest, NextResponse } from "next/server";
import {
  getProductAnalytics,
  parseAnalyticsFilters,
} from "@/lib/product-analytics";
import { getLogger } from "@/lib/logger";
import { adminRequestAuthorized } from "@/lib/admin-auth";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!await adminRequestAuthorized(req))
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  let filters;
  try {
    filters = parseAnalyticsFilters(req.nextUrl.searchParams);
  } catch {
    return NextResponse.json(
      { error: "Invalid date range or timezone" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await getProductAnalytics(filters), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    getLogger({ component: "product_analytics" }).error(
      { error_type: error instanceof Error ? error.name : "Unknown" },
      "Analytics query failed",
    );
    return NextResponse.json(
      { error: "Could not load analytics" },
      { status: 500 },
    );
  }
}

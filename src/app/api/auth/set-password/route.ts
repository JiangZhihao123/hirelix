import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const newPassword =
    body && typeof body === "object" && "newPassword" in body
      ? (body as { newPassword?: unknown }).newPassword
      : null;

  if (typeof newPassword !== "string" || newPassword.length === 0) {
    return NextResponse.json({ message: "New password is required." }, { status: 400 });
  }

  return auth.api.setPassword({
    headers: req.headers,
    body: { newPassword },
    asResponse: true,
  });
}

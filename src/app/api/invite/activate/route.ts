import { NextRequest, NextResponse } from "next/server";

import {
  activateInviteForUser,
  getInviteCodeFromRequest,
  getRequestMeta,
} from "@/lib/beta-invites";
import { getUserFromApiRequest } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const inviteCode = getInviteCodeFromRequest(req, body);
  if (!inviteCode) {
    return NextResponse.json({ error: "Invite code is missing." }, { status: 400 });
  }

  const result = await activateInviteForUser({
    inviteCode,
    userId: user.id,
    userEmail: user.email,
    request: getRequestMeta(req),
  });

  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 409;
    return NextResponse.json({ error: activationErrorMessage(result.reason) }, { status });
  }

  return NextResponse.json({
    ok: true,
    referralPasses: result.referralPasses,
    emailMismatch: result.emailMismatch,
  });
}

function activationErrorMessage(reason: string) {
  if (reason === "expired") return "This invite has expired.";
  if (reason === "revoked") return "This invite has been revoked.";
  if (reason === "already_activated") return "This invite has already been activated by another account.";
  return "Invite not found.";
}

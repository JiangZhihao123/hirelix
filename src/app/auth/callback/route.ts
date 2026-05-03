import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getSafeNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/app";
  }

  const parsed = new URL(next, "https://hirelix.local");
  return `${parsed.pathname}${parsed.search}`;
}

function renderHashCallbackBridge(request: NextRequest, safeNext: string) {
  const target = JSON.stringify(safeNext);

  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <title>Finishing sign in...</title>
  </head>
  <body>
    <script>
      (function () {
        var target = ${target};
        var hash = window.location.hash || "";
        if (hash && (hash.indexOf("access_token=") !== -1 || hash.indexOf("refresh_token=") !== -1)) {
          window.location.replace(target + hash);
          return;
        }
        window.location.replace("/");
      })();
    </script>
  </body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-auth-callback-bridge": new URL(safeNext, request.url).pathname,
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash =
    searchParams.get("token_hash") || searchParams.get("token");
  const next = searchParams.get("next");
  const type = (searchParams.get("type") || "email") as
    | "email"
    | "signup";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  let session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  } | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session) {
      console.error("[auth/callback] code exchange failed:", error?.message);
      return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
    }
    session = data.session;
  } else if (token_hash) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });
    if (error || !data.session) {
      console.error("[auth/callback] OTP verify failed:", error?.message);
      return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
    }
    session = data.session;
  }

  const safeNext = getSafeNext(next);

  if (!session) {
    return renderHashCallbackBridge(request, safeNext);
  }

  const redirectUrl = new URL(safeNext, request.url);
  redirectUrl.hash = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=${session.expires_in}&token_type=bearer&type=${type}`;

  return NextResponse.redirect(redirectUrl);
}

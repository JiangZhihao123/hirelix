import { headers } from "next/headers";
import { AlertTriangle, CheckCircle2, Clock3, LockKeyhole, Sparkles, Ticket } from "lucide-react";

import {
  DEFAULT_BETA_SEAT_LIMIT,
  getInviteByCode,
  isInviteUnavailable,
  isLikelyInviteScanner,
  markInviteClicked,
  recordInviteEvent,
  sanitizeInviteCode,
} from "@/lib/beta-invites";

import { InviteActivationClient } from "./InviteActivationClient";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const inviteCode = sanitizeInviteCode(code);

  if (!inviteCode) {
    return <InviteErrorPage title="Invalid invite" body="This private beta invite link is not valid." />;
  }

  const invite = await getInviteByCode(inviteCode);
  if (!invite) {
    return <InviteErrorPage title="Invite not found" body="This private beta seat does not exist or has already been removed." />;
  }

  const unavailable = isInviteUnavailable(invite);
  if (unavailable === "revoked") {
    return <InviteErrorPage title="Invite revoked" body="This private beta seat has been revoked. Please reply to the invite email if you think this is a mistake." />;
  }
  if (unavailable === "expired") {
    return <InviteErrorPage title="Invite expired" body="This private beta seat has expired. Please reply to the invite email and we can review it manually." />;
  }

  const request = await getServerRequestMeta();
  await recordInviteEvent({
    inviteCode,
    eventType: "invite_opened",
    request,
    metadata: {
      invite_source: invite.source,
      batch_id: invite.batch_id,
      campaign: invite.campaign,
    },
  });

  const likelyScan = isLikelyInviteScanner({
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
  });

  if (likelyScan) {
    await recordInviteEvent({
      inviteCode,
      eventType: "invite_scan_detected",
      request,
      metadata: {
        invite_source: invite.source,
        batch_id: invite.batch_id,
        campaign: invite.campaign,
      },
    });
  } else {
    await markInviteClicked(inviteCode);
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <Ticket className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-sky-700">Hirelix private beta</p>
            <h1 className="text-lg font-bold tracking-tight">Technical headhunter seat</h1>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1fr_28rem]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800">
              <Sparkles className="h-3.5 w-3.5" />
              Private beta seat {invite.seat_number ? `#${invite.seat_number}` : ""} / {DEFAULT_BETA_SEAT_LIMIT}
            </p>
            <h2 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
              Your invite to preview qualified candidates from one hard tech role.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600">
              Paste a client JD, wait about 10 minutes, and get candidate profiles with fit reasons, risks to verify before submitting, and editable outreach context.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <BenefitCard title="1 free preview" body="One real client-role preview with AI sourcing budget during the beta." />
              <BenefitCard title="Technical headhunter beta" body="Built for independent and agency tech recruiters." />
              <BenefitCard title="3 invite passes" body="After activation, invite other technical headhunters." />
            </div>

            <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">This is not a public sign-up link.</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The seat is only activated after Google sign-in or a verified work email code. We do not create an account from link previews, scanners, or unverified clicks.
              </p>
              <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
                <TrustItem icon={LockKeyhole} text="No password required" />
                <TrustItem icon={Clock3} text="14-day invite window" />
                <TrustItem icon={CheckCircle2} text="Email verification" />
              </div>
            </div>
          </div>

          <InviteActivationClient
            inviteCode={invite.invite_code}
            recipientEmail={invite.recipient_email}
            seatNumber={invite.seat_number}
          />
        </section>
      </div>
    </main>
  );
}

function BenefitCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function TrustItem({
  icon: Icon,
  text,
}: {
  icon: typeof LockKeyhole;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <Icon className="h-4 w-4 text-sky-700" />
      <span className="font-medium">{text}</span>
    </div>
  );
}

function InviteErrorPage({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-4 text-slate-950">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
      </div>
    </main>
  );
}

async function getServerRequestMeta() {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  return {
    ipAddress: forwarded?.split(",")[0]?.trim() || headerStore.get("x-real-ip"),
    userAgent: headerStore.get("user-agent"),
    referer: headerStore.get("referer"),
  };
}

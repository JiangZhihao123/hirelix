"use client";

import Image from "next/image";
import { CheckCircle2, X } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";
import type { IntentPath } from "@/lib/analytics";

export function AuthModal({
  open,
  onClose,
  authIntent,
  pendingJd,
  pendingIntentPath,
  pendingRedirectPath,
  modalPreviewTitle,
  onSuccessStart,
}: {
  open: boolean;
  onClose: () => void;
  authIntent: "search" | "signin";
  pendingJd: string;
  pendingIntentPath: IntentPath;
  pendingRedirectPath: string;
  modalPreviewTitle: string;
  onSuccessStart: () => void;
}) {
  if (!open) return null;

  const isSearchAuthIntent = authIntent === "search";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Close sign in dialog"
        onClick={onClose}
        className="absolute inset-0 bg-[#020817]/82 backdrop-blur-md"
      />

      <div
        data-testid="landing-auth-modal"
        className="relative z-[71] w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/[0.14] bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_30%),linear-gradient(180deg,_rgba(5,13,25,0.98)_0%,_rgba(8,17,31,0.98)_100%)] shadow-[0_32px_120px_rgba(2,6,23,0.72)]"
      >
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          <div className="border-b border-white/[0.08] p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Image src="/logo.svg" alt="Hirelix" width={28} height={28} />
                <span className="text-xl font-bold tracking-tight text-white">Hirelix</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/[0.1] p-2 text-slate-300 transition-colors hover:border-white/[0.18] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/70">
                {isSearchAuthIntent ? "Step 2" : "Welcome back"}
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {isSearchAuthIntent
                  ? "One more step to open your shortlist."
                  : "Sign in and keep moving."}
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                {isSearchAuthIntent
                  ? "Your JD is already saved. After sign in, we'll take you straight into the real search with this role still attached."
                  : "Continue directly into your next shortlist without losing momentum."}
              </p>
            </div>

            {isSearchAuthIntent ? (
              <div className="mt-6 rounded-3xl border border-white/[0.1] bg-white/[0.04] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/68">
                      Your JD is saved
                    </p>
                    <p data-testid="landing-auth-preview-title" className="mt-2 text-lg font-semibold text-white">
                      {modalPreviewTitle}
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-300/18 bg-emerald-400/12 px-3 py-1 text-[11px] font-medium text-emerald-200">
                    {pendingIntentPath === "sample" ? "Sample role" : "Your JD"}
                  </span>
                </div>
                <p className="mt-4 max-h-32 overflow-hidden whitespace-pre-wrap text-sm leading-relaxed text-slate-300/82">
                  {pendingJd}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-200">
                  <span className="rounded-full border border-emerald-300/18 bg-emerald-400/10 px-3 py-1 font-medium text-emerald-200">
                    One more step to open your shortlist
                  </span>
                  <span className="rounded-full border border-white/[0.12] bg-white/[0.06] px-3 py-1 font-medium text-slate-100">
                    No card required to start
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-3xl border border-white/[0.1] bg-white/[0.04] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/68">
                  What you&apos;ll unlock
                </p>
                <div className="mt-4 space-y-3 text-sm text-slate-200">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                    <span>Return to your sourcing workspace instantly</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                    <span>Run new searches and review saved shortlist work</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                    <span>Keep everything synced after you sign in</span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-200">
              <span className="rounded-full border border-emerald-300/18 bg-emerald-400/10 px-3 py-1 font-medium text-emerald-200">
                {isSearchAuthIntent ? "Shortlist + drafts" : "Continue instantly"}
              </span>
              <span className="rounded-full border border-sky-300/18 bg-sky-400/10 px-3 py-1 font-medium text-sky-100">
                {isSearchAuthIntent ? "Ranked match reasons" : "Real LinkedIn sourcing"}
              </span>
              <span className="rounded-full border border-white/[0.12] bg-white/[0.06] px-3 py-1 font-medium text-slate-100">
                {isSearchAuthIntent ? "Outreach draft included" : "Your searches stay synced"}
              </span>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <LoginForm
              variant="modal"
              redirectPath={pendingRedirectPath}
              contextTitle={
                isSearchAuthIntent ? "Continue to your shortlist" : "Continue to your next shortlist"
              }
              contextBody={
                isSearchAuthIntent
                  ? "Use Google or email to keep this exact role attached and move straight into the search."
                  : "Use Google or email to sign in without breaking the flow."
              }
              onSuccessStart={onSuccessStart}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


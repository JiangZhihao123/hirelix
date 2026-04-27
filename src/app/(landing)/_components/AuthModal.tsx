"use client";

import Image from "next/image";
import { CheckCircle2, FileText, LockKeyhole, Sparkles, X } from "lucide-react";
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
  const benefits = isSearchAuthIntent
    ? [
        "Keep this role attached after sign in",
        "Open the real search workspace",
        "Review shortlist and outreach drafts",
      ]
    : [
        "Return to your sourcing workspace",
        "Review saved shortlists and drafts",
        "Start a new ranked candidate search",
      ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Close sign in dialog"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
      />

      <div
        data-testid="landing-auth-modal"
        className="relative z-[71] max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_32px_120px_rgba(15,23,42,0.26)]"
      >
        <button
          type="button"
          aria-label="Close sign in dialog"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-950"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="grid max-h-[92vh] overflow-y-auto lg:grid-cols-[0.96fr_1.04fr]">
          <div className="relative overflow-hidden border-b border-slate-200 bg-[#fbfaf7] p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
            <div className="pointer-events-none absolute -right-16 top-12 h-48 w-48 rounded-full bg-blue-100/60 blur-3xl" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4 pr-12">
                <div className="flex items-center gap-2.5">
                  <Image src="/logo.svg" alt="Hirelix" width={28} height={28} />
                  <span className="text-xl font-bold tracking-tight text-slate-950">Hirelix</span>
                </div>
              </div>

              <div className="mt-8">
                <p className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  {isSearchAuthIntent ? "Your search is ready" : "Welcome back"}
                </p>
                <h2 className="mt-4 max-w-[14ch] text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                  {isSearchAuthIntent
                    ? "One more step to open your shortlist."
                    : "Sign in and keep moving."}
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
                  {isSearchAuthIntent
                    ? "Your JD is saved. Sign in to continue into the workspace with this role still attached."
                    : "Use your account to continue into the next shortlist flow without losing context."}
                </p>
              </div>

              {isSearchAuthIntent ? (
                <div className="mt-6 hidden rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] lg:block">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <FileText className="h-3.5 w-3.5 text-blue-600" />
                        Your JD is saved
                      </p>
                      <p
                        data-testid="landing-auth-preview-title"
                        className="mt-2 text-base font-semibold text-slate-950"
                      >
                        {modalPreviewTitle}
                      </p>
                    </div>
                    <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      {pendingIntentPath === "sample" ? "Sample role" : "Your JD"}
                    </span>
                  </div>
                  <p className="mt-4 max-h-28 overflow-hidden whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {pendingJd}
                  </p>
                </div>
              ) : (
                <div className="mt-6 hidden rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] lg:block">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Next step</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">
                        Open your workspace
                      </p>
                    </div>
                    <span className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                      Secure
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      Saved searches
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      Ranked candidates
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      Outreach drafts
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5 hidden space-y-3 rounded-lg border border-slate-200 bg-white/75 p-4 text-sm text-slate-700 lg:block">
                {benefits.map((benefit) => (
                  <div key={benefit} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 hidden flex-wrap gap-2 text-xs lg:flex">
                <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
                  No credit card
                </span>
                <span className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-1 font-medium text-blue-700">
                  Private JD handoff
                </span>
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700">
                  Evidence-based ranking
                </span>
              </div>
            </div>
          </div>

          <div className="relative p-6 sm:p-8 lg:p-10">
            <div className="mx-auto max-w-md">
              <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                <LockKeyhole className="h-3.5 w-3.5 text-blue-600" />
                Secure sign in
              </div>
              <LoginForm
                variant="modal"
                redirectPath={pendingRedirectPath}
                contextTitle={
                  isSearchAuthIntent
                    ? "Continue to your shortlist"
                    : "Continue to your next shortlist"
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
    </div>
  );
}

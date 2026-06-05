"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, Mail, ShieldCheck, Sparkles, Users } from "lucide-react";

import { authClient, useSession } from "@/lib/auth-client";
import { markGrowthGoogleSignInStarted, trackGrowthEvent } from "@/lib/growth-client";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

type InviteActivationClientProps = {
  inviteCode: string;
  recipientEmail: string | null;
  seatNumber: number | null;
};

type ActivationState =
  | { type: "idle" }
  | { type: "activating" }
  | { type: "activated"; referralPasses: number; emailMismatch: boolean }
  | { type: "error"; message: string };

export function InviteActivationClient({
  inviteCode,
  recipientEmail,
  seatNumber,
}: InviteActivationClientProps) {
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState(recipientEmail ?? "");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [emailSigningIn, setEmailSigningIn] = useState(false);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [activation, setActivation] = useState<ActivationState>({ type: "idle" });

  const signedInEmail = session?.user?.email ?? null;
  const canSendOtp = useMemo(() => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()), [email]);

  useEffect(() => {
    document.cookie = `hirelix_invite_code=${encodeURIComponent(inviteCode)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    if (window.__hirelixGrowthIdentity) {
      window.__hirelixGrowthIdentity.invite_code = inviteCode;
    }
  }, [inviteCode]);

  async function activateSeat() {
    setActivation({ type: "activating" });
    setFormError(null);
    try {
      const response = await fetch("/api/invite/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: inviteCode }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        referralPasses?: number;
        emailMismatch?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Activation failed");
      setActivation({
        type: "activated",
        referralPasses: payload.referralPasses ?? 3,
        emailMismatch: Boolean(payload.emailMismatch),
      });
    } catch (error) {
      setActivation({
        type: "error",
        message: error instanceof Error ? error.message : "Activation failed",
      });
    }
  }

  useEffect(() => {
    if (isPending || !session?.user?.id || activation.type !== "idle") return;
    void activateSeat();
    // activateSeat intentionally omitted; activation is driven by session arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activation.type, isPending, session?.user?.id]);

  async function handleGoogleSignIn() {
    setGoogleSigningIn(true);
    setFormError(null);
    try {
      void trackGrowthEvent("google_signin_click", {
        route: window.location.pathname,
        invite_code: inviteCode,
        auth_method: "google",
      });
      markGrowthGoogleSignInStarted();
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: `/invite/${encodeURIComponent(inviteCode)}`,
      });
      if (result?.error) throw new Error("Google sign-in failed to start.");
    } catch {
      setFormError("Google sign-in failed to start. Please try again.");
      setGoogleSigningIn(false);
    }
  }

  async function handleSendOtp() {
    if (!canSendOtp) {
      setFormError("Enter a valid work email first.");
      return;
    }
    setSendingOtp(true);
    setFormError(null);
    try {
      void trackGrowthEvent("email_otp_requested", {
        route: window.location.pathname,
        invite_code: inviteCode,
        auth_method: "email_otp",
      });
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: "sign-in",
      });
      if (result?.error) throw new Error("Could not send the code.");
      setOtpSent(true);
    } catch {
      setFormError("Could not send the code. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleEmailSignIn() {
    if (!canSendOtp || otp.trim().length < 4) {
      setFormError("Enter your email and the code from your inbox.");
      return;
    }
    setEmailSigningIn(true);
    setFormError(null);
    try {
      const result = await authClient.signIn.emailOtp({
        email: email.trim(),
        otp: otp.trim(),
        name: email.trim().split("@")[0],
      });
      if (result?.error) throw new Error("Invalid code.");
      await trackGrowthEvent("signup_success", {
        route: window.location.pathname,
        invite_code: inviteCode,
        has_email: true,
        auth_result: "email_otp",
      }, { awaitResponse: true });
      await activateSeat();
    } catch {
      setFormError("That code did not work. Please check the email and try again.");
    } finally {
      setEmailSigningIn(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        Activate your private beta seat
      </div>

      {activation.type === "activated" ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div>
                <p className="font-semibold">Seat activated.</p>
                <p className="mt-1 text-sm leading-6">
                  You have 1 free client-role preview and {activation.referralPasses} invite passes for other technical headhunters.
                </p>
                {activation.emailMismatch ? (
                  <p className="mt-2 text-xs text-emerald-800">
                    You activated with a different email. We saved this for manual review, but you can continue.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          <Link
            href="/app/search/new"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Start your first shortlist
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}

      {activation.type === "activating" ? (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Activating your seat...
        </div>
      ) : null}

      {activation.type === "error" ? (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {activation.message}
        </div>
      ) : null}

      {!session?.user && activation.type !== "activated" ? (
        <div className="mt-5 space-y-5">
          <GoogleAuthButton
            loading={googleSigningIn || sendingOtp || emailSigningIn}
            onClick={handleGoogleSignIn}
            className="inline-flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          />

          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs font-medium text-slate-500">or use work email</span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Work email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </label>
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={!canSendOtp || sendingOtp || emailSigningIn}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send sign-in code
            </button>
          </div>

          {otpSent ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="block text-sm font-medium text-slate-700">
                Code from email
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  placeholder="6-digit code"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </label>
              <button
                type="button"
                onClick={handleEmailSignIn}
                disabled={emailSigningIn}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {emailSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Activate with email code
              </button>
            </div>
          ) : null}

          {formError ? (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          ) : null}
        </div>
      ) : null}

      {session?.user && activation.type === "idle" ? (
        <button
          type="button"
          onClick={activateSeat}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Activate as {signedInEmail}
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}

      {seatNumber ? (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
          <Users className="h-3.5 w-3.5" />
          Seat #{seatNumber} is reserved for this beta wave.
        </div>
      ) : null}
    </div>
  );
}

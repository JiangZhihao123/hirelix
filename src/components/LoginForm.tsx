"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Loader2, Mail, RotateCcw, ShieldCheck } from "lucide-react";
import { ANALYTICS_EVENTS, getAnalyticsContextFromBrowser, trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { markGrowthGoogleSignInStarted, trackGrowthEvent } from "@/lib/growth-client";
import { GoogleAuthButton } from "./auth/GoogleAuthButton";
import { getLoginFormStyles } from "./auth/loginStyles";

type LoginFormProps = {
  redirectPath?: string;
  contextTitle?: string;
  contextBody?: string;
  onSuccessStart?: () => void;
  onFailure?: () => void;
  variant?: "page" | "modal";
};

export function LoginForm({
  redirectPath,
  contextTitle,
  contextBody,
  onSuccessStart,
  onFailure,
  variant = "page",
}: LoginFormProps) {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [emailSigningIn, setEmailSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const styles = getLoginFormStyles(variant);
  const nextPath =
    redirectPath ||
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/app");
  const normalizedEmail = email.trim().toLowerCase();
  const canSendOtp = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail);
  const canVerifyOtp = canSendOtp && otp.trim().length >= 6;
  const authBusy = googleLoading || sendingOtp || emailSigningIn;

  function redirectAfterEmailSignIn() {
    window.location.assign(nextPath);
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setErrorMessage(null);
    try {
      onSuccessStart?.();
      void trackGrowthEvent("google_signin_click", {
        auth_method: "google",
        route: window.location.pathname,
      });
      markGrowthGoogleSignInStarted();
      // better-auth handles the OAuth dance: it 302s us to Google, then
      // redirects back to `callbackURL` once the session cookie is set.
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: nextPath,
      });

      if (result?.error) {
        throw new Error("Google sign-in failed to start.");
      }
    } catch {
      setErrorMessage("We couldn't start Google sign in. Please try again.");
      onFailure?.();
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSendOtp(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSendOtp) {
      setErrorMessage("Enter a valid work email first.");
      return;
    }

    setSendingOtp(true);
    setErrorMessage(null);
    try {
      trackEvent(ANALYTICS_EVENTS.emailOtpRequested, {
        ...getAnalyticsContextFromBrowser(),
        auth_method: "email_otp",
      });
      void trackGrowthEvent("email_otp_requested", {
        auth_method: "email_otp",
        route: window.location.pathname,
      });
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: normalizedEmail,
        type: "sign-in",
      });
      if (result?.error) {
        throw new Error("Could not send the code.");
      }
      setOtp("");
      setOtpSent(true);
    } catch {
      trackEvent(ANALYTICS_EVENTS.emailOtpFailed, {
        ...getAnalyticsContextFromBrowser(),
        auth_method: "email_otp",
        error_reason: "otp_send_failed",
      });
      setErrorMessage("We couldn't send a sign-in code. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canVerifyOtp) {
      setErrorMessage("Enter your email and the code from your inbox.");
      return;
    }

    setEmailSigningIn(true);
    setErrorMessage(null);
    try {
      onSuccessStart?.();
      const result = await authClient.signIn.emailOtp({
        email: normalizedEmail,
        otp: otp.trim(),
        name: normalizedEmail.split("@")[0],
      });
      if (result?.error) {
        throw new Error("Invalid code.");
      }
      trackEvent(ANALYTICS_EVENTS.emailOtpVerified, {
        ...getAnalyticsContextFromBrowser(),
        auth_method: "email_otp",
      });
      trackEvent(ANALYTICS_EVENTS.signupSuccess, {
        ...getAnalyticsContextFromBrowser(),
        auth_method: "email_otp",
        auth_result: "email_otp",
        has_email: true,
      });
      await trackGrowthEvent("email_otp_verified", {
        auth_method: "email_otp",
        route: window.location.pathname,
      }, { awaitResponse: true });
      await trackGrowthEvent("signup_success", {
        auth_method: "email_otp",
        route: window.location.pathname,
        has_email: true,
        auth_result: "email_otp",
        invite_code: window.__hirelixGrowthIdentity?.invite_code ?? null,
      }, { awaitResponse: true });
      redirectAfterEmailSignIn();
    } catch {
      trackEvent(ANALYTICS_EVENTS.emailOtpFailed, {
        ...getAnalyticsContextFromBrowser(),
        auth_method: "email_otp",
        error_reason: "otp_verify_failed",
      });
      setErrorMessage("That code did not work. Please check the email and try again.");
      onFailure?.();
    } finally {
      setEmailSigningIn(false);
    }
  }

  return (
    <div className={styles.container}>
      {contextTitle && (
        <div className={variant === "modal" ? "text-left" : "text-center"}>
          <h3
            className={
              variant === "modal"
                ? "text-2xl font-bold tracking-tight text-slate-950"
                : "text-lg font-semibold text-foreground"
            }
          >
            {contextTitle}
          </h3>
          {contextBody && (
            <p
              className={
                variant === "modal" ? "mt-2 text-sm leading-6 text-slate-600" : "mt-2 text-sm text-muted"
              }
            >
              {contextBody}
            </p>
          )}
        </div>
      )}

      <GoogleAuthButton
        loading={googleLoading}
        disabled={sendingOtp || emailSigningIn}
        onClick={handleGoogleSignIn}
        className={styles.googleButton}
      />

      <div className="relative" aria-hidden="true">
        <div className="absolute inset-0 flex items-center">
          <div className={`h-px w-full ${styles.dividerColor}`} />
        </div>
        <div className="relative flex justify-center">
          <span className={`bg-white px-3 text-xs font-medium ${styles.dividerText}`}>
            or continue with email
          </span>
        </div>
      </div>

      {!otpSent ? (
        <form className="space-y-3" onSubmit={handleSendOtp}>
          <label className="block text-sm font-medium">
            <span className={variant === "modal" ? "text-slate-700" : "text-foreground"}>Work email</span>
            <span className="relative mt-1 block">
              <Mail className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${styles.icon}`} />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className={styles.input}
              />
            </span>
          </label>
          <button
            type="submit"
            disabled={!canSendOtp || authBusy}
            className={styles.submitButton}
          >
            {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Continue with email
          </button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={handleEmailSignIn}>
          <div className={styles.infoBox}>
            <div className="flex items-start gap-2">
              <ShieldCheck className={`mt-0.5 h-4 w-4 shrink-0 ${styles.successText}`} />
              <p>
                We sent a code to <span className="font-semibold">{normalizedEmail}</span>.
              </p>
            </div>
          </div>
          <label className="block text-sm font-medium">
            <span className={variant === "modal" ? "text-slate-700" : "text-foreground"}>Email code</span>
            <span className="relative mt-1 block">
              <ShieldCheck className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${styles.icon}`} />
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                placeholder="6-digit code"
                className={styles.otpInput}
              />
            </span>
          </label>
          <button
            type="submit"
            disabled={!canVerifyOtp || authBusy}
            className={styles.submitButton}
          >
            {emailSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Verify code
          </button>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setOtp("");
                setOtpSent(false);
                setErrorMessage(null);
              }}
              disabled={authBusy}
              className={styles.secondaryButton}
            >
              Use another email
            </button>
            <button
              type="button"
              onClick={() => void handleSendOtp()}
              disabled={!canSendOtp || authBusy}
              className={styles.secondaryButton}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Resend code
            </button>
          </div>
        </form>
      )}

      {errorMessage && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

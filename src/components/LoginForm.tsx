"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2, Lock, Mail, RefreshCcw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ANALYTICS_EVENTS, getAnalyticsContextFromBrowser, trackEvent } from "@/lib/analytics";

type LoginFormProps = {
  redirectPath?: string;
  contextTitle?: string;
  contextBody?: string;
  onSuccessStart?: () => void;
  variant?: "page" | "modal";
};

export function LoginForm({
  redirectPath,
  contextTitle,
  contextBody,
  onSuccessStart,
  variant = "page",
}: LoginFormProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<"email" | "otp" | "password">("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  function getCurrentPath() {
    return `${window.location.pathname}${window.location.search}`;
  }

  const nextPath = redirectPath || getCurrentPath();
  const containerClassName =
    variant === "modal" ? "w-full max-w-md space-y-5" : "w-full max-w-sm space-y-4";
  const googleButtonClassName =
    variant === "modal"
      ? "flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-white/[0.12] bg-white/[0.06] py-3 text-sm font-medium text-white transition-colors hover:border-white/[0.18] hover:bg-white/[0.09] disabled:opacity-50"
      : "flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-border bg-background py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50";
  const inputClassName =
    variant === "modal"
      ? "w-full rounded-xl border border-white/[0.12] bg-white/[0.06] py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-400 focus:border-sky-300/60 focus:outline-none focus:ring-2 focus:ring-sky-300/20"
      : "w-full rounded-lg border border-border bg-background py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-light focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
  const otpInputClassName =
    variant === "modal"
      ? "w-full rounded-xl border border-white/[0.12] bg-white/[0.06] py-3 pl-10 pr-4 text-center text-base tracking-[0.45em] text-white placeholder:tracking-normal placeholder:text-slate-400 focus:border-sky-300/60 focus:outline-none focus:ring-2 focus:ring-sky-300/20"
      : "w-full rounded-lg border border-border bg-background py-3 pl-10 pr-4 text-center text-base tracking-[0.45em] text-foreground placeholder:tracking-normal placeholder:text-muted-light focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
  const submitButtonClassName =
    variant === "modal"
      ? "flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-300 disabled:opacity-50"
      : "flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50";
  const secondaryButtonClassName =
    variant === "modal"
      ? "inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-sky-200 transition-colors hover:text-white disabled:opacity-50"
      : "inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary-dark disabled:opacity-50";
  const dividerColorClassName = variant === "modal" ? "bg-white/[0.12]" : "bg-border";
  const dividerTextClassName = variant === "modal" ? "text-slate-400" : "text-muted-light";
  const iconClassName = variant === "modal" ? "text-slate-400" : "text-muted-light";
  const infoBoxClassName =
    variant === "modal"
      ? "rounded-xl border border-white/[0.12] bg-white/[0.04] p-3 text-sm text-slate-200"
      : "rounded-lg border border-border bg-background p-3 text-sm text-muted";

  function logAuthDebug(label: string, error: unknown) {
    if (process.env.NODE_ENV !== "development") return;

    const details =
      error && typeof error === "object"
        ? {
            name: "name" in error ? error.name : undefined,
            message: "message" in error ? error.message : undefined,
            status: "status" in error ? error.status : undefined,
            code: "code" in error ? error.code : undefined,
            errorCode: "error_code" in error ? error.error_code : undefined,
          }
        : { value: error };

    console.error(`[auth] ${label}`, details, error);
  }

  function formatAuthErrorMessage(error: unknown, action: "request" | "verify" | "oauth" | "password") {
    const fallbackMessage =
      action === "verify"
        ? "That code did not work. Please check the latest email and try again."
        : action === "password"
          ? "We could not sign you in with that email and password."
        : "Something went wrong. Please try again.";

    const rawMessage = error instanceof Error ? error.message : fallbackMessage;
    const lowerMessage = rawMessage.toLowerCase();
    const errorCode =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "";
    const errorStatus =
      error && typeof error === "object" && "status" in error && typeof error.status === "number"
        ? error.status
        : undefined;

    const cooldownMatch = rawMessage.match(/after\s+(\d+)\s+seconds?/i);
    if (cooldownMatch) {
      const seconds = Number.parseInt(cooldownMatch[1] ?? "0", 10);
      const waitText = Number.isFinite(seconds) && seconds > 0
        ? `${seconds} second${seconds === 1 ? "" : "s"}`
        : "a moment";

      return action === "request"
        ? `We just sent a code. Please wait ${waitText} before requesting another one.`
        : `Please wait ${waitText} and try again.`;
    }

    if (action === "verify") {
      if (lowerMessage.includes("token") || lowerMessage.includes("otp") || lowerMessage.includes("expired")) {
        return "That code is invalid or has expired. Please check the latest email or request a new code.";
      }
    }

    if (action === "request") {
      if (
        errorCode === "over_email_send_rate_limit"
        || lowerMessage.includes("rate limit exceeded")
        || errorStatus === 429
      ) {
        return "You've requested too many codes in a short time. Please wait a minute and try again.";
      }

      if (
        lowerMessage.includes("invalid email")
        || lowerMessage.includes("email address is invalid")
        || lowerMessage.includes("unable to validate email address")
      ) {
        return "Please enter a valid email address and try again.";
      }

      return "We could not send the sign-in code right now. Please try again in a moment.";
    }

    if (action === "password") {
      if (
        errorCode === "invalid_credentials"
        || lowerMessage.includes("invalid login credentials")
        || lowerMessage.includes("invalid credentials")
      ) {
        return "That email and password did not match. Check your credentials or use a one-time code instead.";
      }

      if (lowerMessage.includes("email not confirmed")) {
        return "Your email is not confirmed yet. Use a one-time code first, then try password login again.";
      }

      return "We could not sign you in with that email and password. Please try again or use a one-time code instead.";
    }

    if (action === "oauth") {
      return "Google sign-in could not start right now. Please try again.";
    }

    return rawMessage;
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setErrorMsg("");
    onSuccessStart?.();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${nextPath}`,
      },
    });
    if (error) {
      logAuthDebug("google sign-in failed", error);
      setErrorMsg(formatAuthErrorMessage(error, "oauth"));
      setGoogleLoading(false);
    }
  }

  async function requestOtp(targetEmail: string, source: "primary" | "resend") {
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const normalizedEmail = targetEmail.trim().toLowerCase();
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });

      if (error) throw error;

      trackEvent(ANALYTICS_EVENTS.emailOtpRequested, {
        ...getAnalyticsContextFromBrowser(),
        auth_method: "email",
        otp_request_source: source,
      });

      setEmail(normalizedEmail);
      setPhase("otp");
      setOtpCode("");
      setSuccessMsg(
        redirectPath?.includes("/app/search/new")
          ? "Enter the code we sent to keep this shortlist moving."
          : "Enter the code we sent to continue to Hirelix.",
      );
    } catch (err) {
      logAuthDebug(`email OTP ${source} failed`, err);
      const message = formatAuthErrorMessage(err, "request");
      setErrorMsg(message);
      trackEvent(ANALYTICS_EVENTS.emailOtpFailed, {
        ...getAnalyticsContextFromBrowser(),
        auth_method: "email",
        otp_stage: source,
        error_message: message,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    await requestOtp(email, "primary");
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw error;

      // Force Supabase to persist a fresh session before the first product API call.
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        logAuthDebug("post-password refresh failed", refreshError);
      }

      onSuccessStart?.();
      router.push(nextPath);
    } catch (err) {
      logAuthDebug("password sign-in failed", err);
      setErrorMsg(formatAuthErrorMessage(err, "password"));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !otpCode.trim()) return;

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otpCode.trim(),
        type: "email",
      });

      if (error) throw error;

      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        logAuthDebug("post-otp refresh failed", refreshError);
      }

      trackEvent(ANALYTICS_EVENTS.emailOtpVerified, {
        ...getAnalyticsContextFromBrowser(),
        auth_method: "email",
      });

      onSuccessStart?.();
      router.push(nextPath);
    } catch (err) {
      logAuthDebug("email OTP verify failed", err);
      const message = formatAuthErrorMessage(err, "verify");
      setErrorMsg(message);
      trackEvent(ANALYTICS_EVENTS.emailOtpFailed, {
        ...getAnalyticsContextFromBrowser(),
        auth_method: "email",
        otp_stage: "verify",
        error_message: message,
      });
    } finally {
      setLoading(false);
    }
  }

  function handleUseDifferentEmail() {
    setPhase("email");
    setEmail("");
    setOtpCode("");
    setPassword("");
    setErrorMsg("");
    setSuccessMsg("");
  }

  function switchToPasswordPhase() {
    setPhase("password");
    setOtpCode("");
    setErrorMsg("");
    setSuccessMsg("");
  }

  function switchToEmailPhase() {
    setPhase("email");
    setPassword("");
    setErrorMsg("");
    setSuccessMsg("");
  }

  return (
    <div className={containerClassName}>
      {contextTitle && (
        <div className={variant === "modal" ? "text-left" : "text-center"}>
          <h3 className={variant === "modal" ? "text-xl font-semibold text-white" : "text-lg font-semibold text-foreground"}>
            {contextTitle}
          </h3>
          {contextBody && (
            <p className={variant === "modal" ? "mt-2 text-sm text-slate-300" : "mt-2 text-sm text-muted"}>
              {contextBody}
            </p>
          )}
        </div>
      )}

      <button
        onClick={handleGoogleLogin}
        disabled={googleLoading}
        className={googleButtonClassName}
      >
        {googleLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </>
        )}
      </button>

      <div className="flex items-center gap-3">
        <div className={`h-px flex-1 ${dividerColorClassName}`} />
        <span className={`text-xs ${dividerTextClassName}`}>or</span>
        <div className={`h-px flex-1 ${dividerColorClassName}`} />
      </div>

      {phase === "email" ? (
        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <div className="relative">
            <Mail className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${iconClassName}`} />
            <input
              type="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClassName}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className={submitButtonClassName}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue with email"}
          </button>
          <button
            type="button"
            onClick={switchToPasswordPhase}
            disabled={loading}
            className={secondaryButtonClassName}
          >
            <Lock className="h-4 w-4" />
            Use password instead
          </button>
        </form>
      ) : phase === "password" ? (
        <form onSubmit={handlePasswordSubmit} className="space-y-3">
          <div className="relative">
            <Mail className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${iconClassName}`} />
            <input
              type="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClassName}
            />
          </div>
          <div className="relative">
            <Lock className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${iconClassName}`} />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClassName}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className={submitButtonClassName}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue with password"}
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={switchToEmailPhase}
              disabled={loading}
              className={secondaryButtonClassName}
            >
              <Mail className="h-4 w-4" />
              Use email code instead
            </button>
            <button
              type="button"
              onClick={handleUseDifferentEmail}
              disabled={loading}
              className={secondaryButtonClassName}
            >
              Use a different email
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerifySubmit} className="space-y-3">
          <div className={infoBoxClassName}>
            <p className="font-medium text-inherit">Code sent to {email}</p>
            <p className="mt-1 text-xs opacity-80">
              Enter the 6-digit code from your email to finish signing in.
            </p>
          </div>
          <div className="relative">
            <ShieldCheck className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${iconClassName}`} />
            <input
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className={otpInputClassName}
            />
          </div>
          <button
            type="submit"
            disabled={loading || otpCode.trim().length < 6}
            className={submitButtonClassName}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify code"}
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => requestOtp(email, "resend")}
              disabled={loading}
              className={secondaryButtonClassName}
            >
              <RefreshCcw className="h-4 w-4" />
              Resend code
            </button>
            <button
              type="button"
              onClick={switchToPasswordPhase}
              disabled={loading}
              className={secondaryButtonClassName}
            >
              <Lock className="h-4 w-4" />
              Use password instead
            </button>
            <button
              type="button"
              onClick={handleUseDifferentEmail}
              disabled={loading}
              className={secondaryButtonClassName}
            >
              Use a different email
            </button>
          </div>
        </form>
      )}

      {errorMsg && (
        <p className="text-center text-sm text-red-500">{errorMsg}</p>
      )}
      {successMsg && (
        <p className={`text-center text-sm ${variant === "modal" ? "text-emerald-300" : "text-emerald-600"}`}>{successMsg}</p>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { ANALYTICS_EVENTS, getAnalyticsContextFromBrowser, trackEvent } from "@/lib/analytics";
import { EmailPhase } from "./auth/EmailPhase";
import { GoogleAuthButton } from "./auth/GoogleAuthButton";
import { OtpPhase } from "./auth/OtpPhase";
import { PasswordPhase } from "./auth/PasswordPhase";
import { getLoginFormStyles } from "./auth/loginStyles";

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

  const styles = getLoginFormStyles(variant);
  const nextPath = redirectPath || `${window.location.pathname}${window.location.search}`;

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

  function formatAuthErrorMessage(
    error: unknown,
    action: "request" | "verify" | "oauth" | "password",
  ) {
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
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : undefined;

    const cooldownMatch = rawMessage.match(/after\s+(\d+)\s+seconds?/i);
    if (cooldownMatch) {
      const seconds = Number.parseInt(cooldownMatch[1] ?? "0", 10);
      const waitText =
        Number.isFinite(seconds) && seconds > 0
          ? `${seconds} second${seconds === 1 ? "" : "s"}`
          : "a moment";
      return action === "request"
        ? `We just sent a code. Please wait ${waitText} before requesting another one.`
        : `Please wait ${waitText} and try again.`;
    }

    if (action === "verify") {
      if (
        lowerMessage.includes("token") ||
        lowerMessage.includes("otp") ||
        lowerMessage.includes("expired")
      ) {
        return "That code is invalid or has expired. Please check the latest email or request a new code.";
      }
    }

    if (action === "request") {
      if (
        errorCode === "over_email_send_rate_limit" ||
        lowerMessage.includes("rate limit exceeded") ||
        errorStatus === 429
      ) {
        return "You've requested too many codes in a short time. Please wait a minute and try again.";
      }
      if (
        lowerMessage.includes("invalid email") ||
        lowerMessage.includes("email address is invalid") ||
        lowerMessage.includes("unable to validate email address")
      ) {
        return "Please enter a valid email address and try again.";
      }
      return "We could not send the sign-in code right now. Please try again in a moment.";
    }

    if (action === "password") {
      if (
        errorCode === "invalid_credentials" ||
        lowerMessage.includes("invalid login credentials") ||
        lowerMessage.includes("invalid credentials")
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
      options: { redirectTo: `${window.location.origin}${nextPath}` },
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
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) logAuthDebug("post-password refresh failed", refreshError);
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
      if (refreshError) logAuthDebug("post-otp refresh failed", refreshError);
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
    <div className={styles.container}>
      {contextTitle && (
        <div className={variant === "modal" ? "text-left" : "text-center"}>
          <h3
            className={
              variant === "modal"
                ? "text-xl font-semibold text-white"
                : "text-lg font-semibold text-foreground"
            }
          >
            {contextTitle}
          </h3>
          {contextBody && (
            <p
              className={
                variant === "modal" ? "mt-2 text-sm text-slate-300" : "mt-2 text-sm text-muted"
              }
            >
              {contextBody}
            </p>
          )}
        </div>
      )}

      <GoogleAuthButton
        loading={googleLoading}
        onClick={handleGoogleLogin}
        className={styles.googleButton}
      />

      <div className="flex items-center gap-3">
        <div className={`h-px flex-1 ${styles.dividerColor}`} />
        <span className={`text-xs ${styles.dividerText}`}>or</span>
        <div className={`h-px flex-1 ${styles.dividerColor}`} />
      </div>

      {phase === "email" ? (
        <EmailPhase
          email={email}
          onChange={setEmail}
          onSubmit={handleEmailSubmit}
          onSwitchToPassword={switchToPasswordPhase}
          loading={loading}
          styles={styles}
        />
      ) : phase === "password" ? (
        <PasswordPhase
          email={email}
          password={password}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={handlePasswordSubmit}
          onSwitchToEmail={switchToEmailPhase}
          onUseDifferentEmail={handleUseDifferentEmail}
          loading={loading}
          styles={styles}
        />
      ) : (
        <OtpPhase
          email={email}
          otpCode={otpCode}
          onOtpChange={setOtpCode}
          onSubmit={handleVerifySubmit}
          onResend={() => requestOtp(email, "resend")}
          onSwitchToPassword={switchToPasswordPhase}
          onUseDifferentEmail={handleUseDifferentEmail}
          loading={loading}
          styles={styles}
        />
      )}

      {errorMsg && <p className="text-center text-sm text-red-500">{errorMsg}</p>}
      {successMsg && (
        <p className={`text-center text-sm ${styles.successText}`}>{successMsg}</p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { ANALYTICS_EVENTS, getAnalyticsContextFromBrowser, trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { trackGrowthEvent } from "@/lib/growth-client";
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
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const styles = getLoginFormStyles(variant);
  const nextPath = redirectPath || `${window.location.pathname}${window.location.search}`;

  async function handleSignIn() {
    setLoading(true);
    setErrorMessage(null);
    try {
      onSuccessStart?.();
      trackEvent(ANALYTICS_EVENTS.emailOtpRequested, {
        ...getAnalyticsContextFromBrowser(),
        auth_method: "google",
      });
      void trackGrowthEvent("google_signin_click", {
        auth_method: "google",
        route: window.location.pathname,
      });
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
      trackEvent(ANALYTICS_EVENTS.emailOtpFailed, {
        ...getAnalyticsContextFromBrowser(),
        auth_method: "google",
        error_reason: "signin_start_failed",
      });
      setErrorMessage("We couldn't start Google sign in. Please try again.");
      onFailure?.();
    } finally {
      setLoading(false);
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
        loading={loading}
        onClick={handleSignIn}
        className={styles.googleButton}
      />
      {errorMessage && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

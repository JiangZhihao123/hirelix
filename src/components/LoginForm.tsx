"use client";

import { useState } from "react";
import { ANALYTICS_EVENTS, getAnalyticsContextFromBrowser, trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { GoogleAuthButton } from "./auth/GoogleAuthButton";
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
  const [loading, setLoading] = useState(false);

  const styles = getLoginFormStyles(variant);
  const nextPath = redirectPath || `${window.location.pathname}${window.location.search}`;

  async function handleSignIn() {
    setLoading(true);
    onSuccessStart?.();
    trackEvent(ANALYTICS_EVENTS.emailOtpRequested, {
      ...getAnalyticsContextFromBrowser(),
      auth_method: "google",
    });
    // better-auth handles the OAuth dance: it 302s us to Google, then
    // redirects back to `callbackURL` once the session cookie is set.
    await authClient.signIn.social({
      provider: "google",
      callbackURL: nextPath,
    });
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
    </div>
  );
}

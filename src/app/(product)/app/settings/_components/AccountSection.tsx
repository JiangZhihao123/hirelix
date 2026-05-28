"use client";

import { useState, type FormEvent } from "react";
import { Check, KeyRound, Loader2 } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { fetchWithUserSession } from "@/lib/client-auth";
import {
  MessageBanner,
  MessageState,
  SettingsFieldGroup,
  SettingsSection,
} from "./shared";

function getPasswordError(error: unknown) {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : "";

  if (message.toLowerCase().includes("invalid password")) {
    return "Current password is not correct.";
  }
  if (message.toLowerCase().includes("too short")) {
    return "Use at least 8 characters.";
  }
  if (message.toLowerCase().includes("already set")) {
    return "A password is already set. Use change password instead.";
  }
  return "Could not update the password. Please try again.";
}

export function AccountSection({
  signInMethods,
  onPasswordSet,
}: {
  signInMethods: string[];
  onPasswordSet: () => void;
}) {
  const hasPassword = signInMethods.includes("credential");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<MessageState>(null);
  const passwordActionLabel = hasPassword ? "Update password" : "Set password";
  const canSubmitPassword =
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    (!hasPassword || currentPassword.length > 0) &&
    !savingPassword;

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordMessage({ type: "error", text: "Use at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "The new passwords do not match." });
      return;
    }
    if (hasPassword && currentPassword.length === 0) {
      setPasswordMessage({ type: "error", text: "Enter your current password first." });
      return;
    }

    setSavingPassword(true);
    try {
      if (hasPassword) {
        const result = await authClient.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        });
        if (result?.error) {
          throw result.error;
        }
      } else {
        const response = await fetchWithUserSession("/api/auth/set-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(typeof data?.message === "string" ? data.message : "Set password failed.");
        }
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage({
        type: "success",
        text: hasPassword ? "Password updated." : "Password set. You can now sign in with email and password.",
      });
      onPasswordSet();
    } catch (error) {
      setPasswordMessage({ type: "error", text: getPasswordError(error) });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <SettingsSection
      id="account"
      eyebrow="Account"
      title="Account"
      description="Manage password sign-in for this account."
    >
      <div className="space-y-5">
        <SettingsFieldGroup
          title={hasPassword ? "Change password" : "Set password"}
          description={
            hasPassword
              ? "Update the password for this email login."
              : "Add a password so you can sign in without waiting for an email code."
          }
        >
          <form className="space-y-4" onSubmit={handlePasswordSubmit}>
            {hasPassword ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-800">
                  Current password
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-800">
                  New password
                </label>
                <input
                  type="password"
                  autoComplete={hasPassword ? "new-password" : "new-password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-800">
                  Confirm password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat password"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-slate-200/80 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex items-center gap-2 text-sm text-slate-600">
                <KeyRound className="h-4 w-4 text-slate-400" />
                Password login is optional. Email code sign-in remains available.
              </div>
              <button
                type="submit"
                disabled={!canSubmitPassword}
                className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingPassword ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {passwordActionLabel}
              </button>
            </div>

            <MessageBanner message={passwordMessage} />
          </form>
        </SettingsFieldGroup>
      </div>
    </SettingsSection>
  );
}

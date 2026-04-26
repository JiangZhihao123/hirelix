"use client";

import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { MessageBanner, MessageState, SettingsFieldGroup, SettingsSection } from "./shared";

export function AccountSection({
  user,
  hasPasswordLogin,
  onPasswordUpdated,
}: {
  user: User | null;
  hasPasswordLogin: boolean;
  onPasswordUpdated: () => void;
}) {
  const [passwordForm, setPasswordForm] = useState({ password: "", confirmPassword: "" });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<MessageState>(null);

  async function handleSavePassword() {
    if (!user) return;

    if (passwordForm.password.length < 8) {
      setPasswordMessage({ type: "error", text: "Use at least 8 characters for your password." });
      return;
    }

    if (passwordForm.password !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: "error", text: "Your password confirmation does not match." });
      return;
    }

    setSavingPassword(true);
    setPasswordMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.password,
        data: {
          ...user.user_metadata,
          password_login_enabled: true,
        },
      });

      if (error) throw error;

      setPasswordForm({ password: "", confirmPassword: "" });
      setPasswordMessage({
        type: "success",
        text: hasPasswordLogin ? "Password updated." : "Password login added.",
      });
      onPasswordUpdated();
    } catch (err) {
      setPasswordMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Could not update your password.",
      });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <SettingsSection
      id="account"
      eyebrow="Account"
      title="Account security"
      description="Use password login only as a durable backup. Google sign-in and email codes remain the recommended default."
    >
      <div className="space-y-5">
        <SettingsFieldGroup
          title="Password login"
          description={
            hasPasswordLogin
              ? "Password backup is enabled for this account."
              : "No password is set yet for this account."
          }
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                      hasPasswordLogin
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {hasPasswordLogin ? "Enabled" : "Not set"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {user?.email || "Unknown email"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {hasPasswordLogin
                    ? "Update it here without affecting Google sign-in or one-time codes."
                    : "Add a password only if you want a backup login method for the same account."}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                New password
              </label>
              <input
                type="password"
                value={passwordForm.password}
                onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                placeholder="At least 8 characters"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Confirm password
              </label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                }
                placeholder="Repeat your password"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm text-slate-600">
              This only changes login access. Billing and company settings stay the same.
            </p>
            <button
              type="button"
              onClick={handleSavePassword}
              disabled={savingPassword}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {savingPassword ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {hasPasswordLogin ? "Update password" : "Add password login"}
            </button>
          </div>
        </SettingsFieldGroup>

        <MessageBanner message={passwordMessage} />
      </div>
    </SettingsSection>
  );
}

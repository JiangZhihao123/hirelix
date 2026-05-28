"use client";

import { CheckCircle2, MailCheck } from "lucide-react";

import { SettingsFieldGroup, SettingsSection } from "./shared";

type AccountUser = {
  email?: string;
  user_metadata?: { name?: string | null };
} | null;

export function AccountSection({
  user,
  authMethods,
}: {
  user: AccountUser;
  authMethods: string[];
}) {
  const hasGoogleAuth = authMethods.includes("google");

  return (
    <SettingsSection
      id="account"
      eyebrow="Account"
      title="Account security"
      description="Review how this account can sign in to Hirelix."
    >
      <div className="space-y-5">
        <SettingsFieldGroup
          title="Sign-in methods"
          description={
            hasGoogleAuth
              ? "Available sign-in methods for this account."
              : "Use a one-time code sent to your verified email."
          }
        >
          <div className="space-y-3">
            <div className="rounded-md border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                      <MailCheck className="h-3 w-3" />
                      Email code
                    </span>
                    <span className="text-xs text-slate-500">
                      {user?.email || "Unknown email"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    We send a one-time code to this email when you sign in.
                    Hirelix does not store a password for this method.
                  </p>
                </div>
              </div>
            </div>

            {hasGoogleAuth && (
              <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Google OAuth
                      </span>
                      <span className="text-xs text-slate-500">
                        Linked
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      This account can also sign in with Google OAuth.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SettingsFieldGroup>
      </div>
    </SettingsSection>
  );
}

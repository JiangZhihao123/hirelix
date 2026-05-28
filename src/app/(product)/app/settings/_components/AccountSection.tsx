"use client";

import { CheckCircle2 } from "lucide-react";

import { SettingsFieldGroup, SettingsSection } from "./shared";

type AccountUser = {
  email?: string;
  user_metadata?: { name?: string | null };
} | null;

export function AccountSection({ user }: { user: AccountUser }) {
  return (
    <SettingsSection
      id="account"
      eyebrow="Account"
      title="Account security"
      description="Hirelix supports Google sign-in and one-time email codes. Use the method that matches how you signed in."
    >
      <div className="space-y-5">
        <SettingsFieldGroup
          title="Sign-in method"
          description="Google OAuth or a verified email code."
        >
          <div className="rounded-md border border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified
                  </span>
                  <span className="text-xs text-slate-500">
                    {user?.email || "Unknown email"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Your account is tied to this email. If you use Google,
                  manage password and security settings in your Google account.
                  Email-code sign in does not require a password.
                </p>
              </div>
              <a
                href="https://myaccount.google.com/security"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300"
              >
                Open Google security
              </a>
            </div>
          </div>
        </SettingsFieldGroup>
      </div>
    </SettingsSection>
  );
}

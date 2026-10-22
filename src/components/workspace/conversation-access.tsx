"use client";

import Link from "next/link";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { AGENT_PLAN, formatCredits, type AgentAccess } from "@/lib/agent-plan";
import { billingSettingsHref } from "@/lib/workspace/return-path";

export function ConversationAccess({access, required = false, returnTo}: {access?: AgentAccess | null; required?: boolean; returnTo: string}) {
  const t = useT(), {locale} = useLanguage();
  if ((!access || access.state === "legacy") && !required) return null;
  const limited = required || access?.state === "expired" || (access?.state !== "trial_ready" && (access?.remaining ?? 1) <= 0);
  const trial = access?.state === "trial" || access?.state === "trial_ready";
  if (!limited && !trial) return null;
  return <div className={`ws-conversation-access${limited ? " is-limited" : ""}`} role={limited ? "status" : undefined}>
    <p>{limited
      ? t("AI access needs attention. Your saved work stays available.")
      : access?.state === "trial_ready"
        ? t("Your {days}-day trial starts with your first AI task. {credits} AI credits; no card required.").replace("{days}",String(AGENT_PLAN.trialDays)).replace("{credits}",String(AGENT_PLAN.trialCredits))
        : t("Trial · {credits} AI credits remaining").replace("{credits}",formatCredits(access!.remaining,locale))}</p>
    <Link href={billingSettingsHref(returnTo)}>{t(access?.state === "paid" ? "View subscription" : "View plans")}</Link>
  </div>;
}

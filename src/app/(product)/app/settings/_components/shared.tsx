import type { ReactNode } from "react";

export interface HeadhunterProfile {
  recruiter_name: string;
  firm_name: string;
  specialization: string;
  bio: string;
}

export const EMPTY_PROFILE: HeadhunterProfile = {
  recruiter_name: "",
  firm_name: "",
  specialization: "",
  bio: "",
};

export type MessageState = { type: "success" | "error"; text: string } | null;
export type SettingsSectionId = "account" | "billing" | "profile";

export function SettingsSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: SettingsSectionId;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-slate-200/90 bg-white">
      <div className="border-b border-slate-200/80 px-6 py-4 sm:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-[24px] font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{description}</p>
      </div>
      <div className="px-6 py-4 sm:px-7">{children}</div>
    </section>
  );
}

export function SettingsFieldGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-slate-200/80 pt-5 first:border-t-0 first:pt-0">
      <div className="max-w-2xl">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function MessageBanner({ message }: { message: MessageState }) {
  if (!message) return null;
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        message.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {message.text}
    </div>
  );
}

export function formatDateLabel(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getUsageWidth(used: number, limit: number) {
  return `${Math.min((used / Math.max(limit, 1)) * 100, 100)}%`;
}

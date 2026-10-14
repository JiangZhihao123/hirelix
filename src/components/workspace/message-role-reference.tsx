"use client";

import { ArrowUpRight, BriefcaseBusiness } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import type { Role } from "@/lib/workspace/types";

export type RoleReference = Pick<Role, "id" | "title" | "client_name">;

export function MessageRoleReference({ reference, onOpen }: {
  reference: unknown;
  onOpen: (source: { title: string; href: string }) => void;
}) {
  const t = useT();
  if (!reference || typeof reference !== "object") return null;
  const role = reference as Partial<RoleReference>;
  if (typeof role.id !== "string" || typeof role.title !== "string") return null;
  const title = [role.client_name, role.title].filter(Boolean).join(" · ");
  return <div className="ws-message-references ws-message-role-reference">
    <button type="button" onClick={() => onOpen({ title, href: `/app/roles/${role.id}` })}>
      <BriefcaseBusiness size={18} aria-hidden="true" />
      <span><small>{t("Role")} / JD</small><strong>{title}</strong></span>
      <ArrowUpRight size={13} aria-hidden="true" />
    </button>
  </div>;
}

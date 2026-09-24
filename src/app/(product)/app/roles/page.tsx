"use client";

import { useLanguage, useT } from "@/components/LanguageProvider";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import {
  date,
  ErrorNotice,
  Loading,
  useQuery,
} from "@/components/workspace/client";
import { RoleForm } from "@/components/workspace/forms";
import type { Role } from "@/lib/workspace/types";
export default function Roles() {
  const t = useT();
  const { locale } = useLanguage();
  const router = useRouter(),
    query = useQuery<{
      roles: Array<
        Role & { candidate_count: number; submission_count: number }
      >;
    }>("/roles");
  const [adding, setAdding] = useState(false),
    [filter, setFilter] = useState(""),
    [status, setStatus] = useState("all");
  const roles = (query.data?.roles || []).filter(
    (role) =>
      (status === "all" || role.status === status) &&
      `${role.title} ${role.client_name}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );
  return (
    <div className="ws-page">
      <header className="ws-page-header">
        <div>
          <h1>{t("Roles")}</h1>
          <p>
            {t("Your assignments, with the requirements and conversations behind them.")}
          </p>
        </div>
        <button
          className="ws-button ws-button-primary"
          onClick={() => setAdding(true)}
        >
          <Plus size={15} />
          {t("Add role")}
        </button>
      </header>
      <div className="ws-toolbar">
        <div className="ws-search">
          <Search size={16} />
          <input
            aria-label={t("Search roles")}
            placeholder={t("Search by role or client")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <div className="ws-filters">
          <select
            aria-label={t("Role status")}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {["all", "active", "paused", "closed"].map((value) => (
              <option key={value} value={value}>
                {value === "all"
                  ? t("All roles")
                  : t(value)}
              </option>
            ))}
          </select>
          <span className="ws-count">{locale === "zh" ? `${roles.length} 个职位` : `${roles.length} roles`}</span>
        </div>
      </div>
      <ErrorNotice error={query.error} retry={query.refresh} />
      {query.loading ? (
        <Loading>{t("Loading roles…")}</Loading>
      ) : roles.length ? (
        <div className="ws-role-grid">
          {roles.map((role) => (
            <Link
              className="ws-role-row"
              key={role.id}
              href={`/app/roles/${role.id}`}
            >
              <div>
                <h2>{role.title}</h2>
                <p>{role.client_name || t("Client not yet recorded")}</p>
              </div>
              <div className="ws-role-count">
                <p>{locale === "zh" ? `${role.candidate_count} 位候选人` : `${role.candidate_count} candidates`}</p>
                <p>{locale === "zh" ? `已记录 ${role.submission_count} 次推荐` : `${role.submission_count} submissions recorded`}</p>
              </div>
              <div className="ws-role-count">
                <p>{t("Updated")}</p>
                <p>{date(role.updated_at)}</p>
              </div>
              <div>
                <span className="ws-status" data-status={role.status}>
                  {t(role.status)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="ws-empty">
          <h2>{filter ? t("No matching roles") : t("Start with a client’s JD.")}</h2>
          <p>
            {t("Keep the original requirements, candidate discussions and client material together. You can add people from your existing candidate pool.")}
          </p>
          <button className="ws-button mt-5" onClick={() => setAdding(true)}>
            {t("Add your first role")}
          </button>
        </div>
      )}
      {adding && (
        <RoleForm
          onClose={() => setAdding(false)}
          onSaved={(role) => router.push(`/app/roles/${role.id}`)}
        />
      )}
    </div>
  );
}

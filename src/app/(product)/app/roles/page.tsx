"use client";
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
          <h1>Roles</h1>
          <p>
            Your assignments, with the requirements and conversations behind
            them.
          </p>
        </div>
        <button
          className="ws-button ws-button-primary"
          onClick={() => setAdding(true)}
        >
          <Plus size={15} />
          Add role
        </button>
      </header>
      <div className="ws-toolbar">
        <div className="ws-search">
          <Search size={16} />
          <input
            aria-label="Search roles"
            placeholder="Search by role or client"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <div className="ws-filters">
          <select
            aria-label="Role status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {["all", "active", "paused", "closed"].map((value) => (
              <option key={value} value={value}>
                {value === "all"
                  ? "All roles"
                  : value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
          <span className="ws-count">{roles.length} roles</span>
        </div>
      </div>
      <ErrorNotice error={query.error} retry={query.refresh} />
      {query.loading ? (
        <Loading>Loading roles…</Loading>
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
                <p>{role.client_name || "Client not yet recorded"}</p>
              </div>
              <div className="ws-role-count">
                <p>{role.candidate_count} candidates</p>
                <p>{role.submission_count} submissions recorded</p>
              </div>
              <div className="ws-role-count">
                <p>Updated</p>
                <p>{date(role.updated_at)}</p>
              </div>
              <div>
                <span className="ws-status" data-status={role.status}>
                  {role.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="ws-empty">
          <h2>{filter ? "No matching roles" : "Start with a client’s JD."}</h2>
          <p>
            Keep the original requirements, candidate discussions and client
            material together. You can add people from your existing candidate
            pool.
          </p>
          <button className="ws-button mt-5" onClick={() => setAdding(true)}>
            Add your first role
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

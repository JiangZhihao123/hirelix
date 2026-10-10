"use client";
import { useState, type FormEvent } from "react";
import { useT } from "@/components/LanguageProvider";
import { api, Dialog, ErrorNotice, Field, date } from "./client";
import type { AssistantAction } from "@/lib/workspace/conversations";
export function ActionReview({
  conversationId,
  messageId,
  action,
  onClose,
  onSaved,
}: {
  conversationId: string;
  messageId: string;
  action: AssistantAction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [fields, setFields] = useState(action.fields),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false);
  function set(key: string, value: unknown) {
    setFields((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
  }
  function close() {
    if (
      !saving &&
      (!dirty || window.confirm(t("Discard your edits to this proposal?")))
    )
      onClose();
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(`/conversations/${conversationId}/actions`, {
        method: "POST",
        body: JSON.stringify({
          message_id: messageId,
          action_id: action.id,
          fields,
        }),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }
  if (action.kind === "create_candidate" || action.kind === "update_candidate") {
    const labels: Record<string, string> = {name: "Full name", headline: "Current role / headline", location: "Location", email: "Email", phone: "Phone", skills: "Expertise", profile_url: "Profile URL", note: "Your private note", summary: "Professional summary", experience: "Experience", education: "Education", languages: "Languages", work_preferences: "Work preferences"};
    return <Dialog title={action.title} onClose={close} wide><form className="ws-form" onSubmit={save}>
      <ErrorNotice error={error} />
      <dl>{Object.entries(action.fields.changes as Record<string, unknown>).filter(([,value]) => value !== null).map(([key,value]) => <div key={key}><dt>{t(labels[key] || key)}</dt><dd className="whitespace-pre-wrap">{Array.isArray(value) ? value.map(item => typeof item === "object" && item ? Object.values(item).filter(Boolean).join(" · ") : String(item)).join("\n") || t("Clear") : String(value) || t("Clear")}</dd></div>)}</dl>
      <p>{t("Ask your assistant to change anything before saving.")}</p>
      <button className="ws-button ws-button-primary" disabled={saving}>{t(saving ? "Saving…" : "Save candidate")}</button>
    </form></Dialog>;
  }
  return (
    <Dialog
      title={
        action.kind === "create_role"
          ? t("Review new role")
          : action.kind === "update_role_brief"
            ? t("Review updated requirements")
            : action.kind === "update_sharing_permission"
              ? t("Review sharing permission")
            : t("Review conversation record")
      }
      onClose={close}
      wide
    >
      <form className="ws-form" onSubmit={save} autoComplete="off">
        <ErrorNotice error={error} />
        <Field label={t("Title")}>
          <input
            required
            value={String(fields.title || "")}
            readOnly={action.kind === "update_role_brief"}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        {action.kind === "create_role" ||
        action.kind === "update_role_brief" ? (
          <>
            {action.kind === "update_role_brief" && (
              <section className="ws-panel">
                <p className="ws-muted">
                  {t(
                    "The original JD is preserved. Review the complete requirements below; accepting saves a new version and the original feedback.",
                  )}
                </p>
                <p className="whitespace-pre-wrap">
                  {String(fields.feedback || "")}
                </p>
                <details>
                  <summary>{t("Previous requirements")}</summary>
                  {(["priorities", "flexible", "unknowns"] as const).map(
                    (key) => (
                      <div key={key}>
                        <strong>
                          {t(
                            {
                              priorities: "Priorities",
                              flexible: "Flexible requirements",
                              unknowns: "Still to clarify",
                            }[key]
                          )}
                        </strong>
                        <ul>
                          {(
                            (fields.previous_brief as Record<string, string[]>)[
                              key
                            ] || []
                          ).map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ),
                  )}
                </details>
              </section>
            )}
            {action.kind === "create_role" && (
              <>
                <Field label={t("Client")}>
                  <input
                    required
                    value={String(fields.client_name || "")}
                    onChange={(e) => set("client_name", e.target.value)}
                  />
                </Field>
                <Field label={t("Original job description")}>
                  <textarea
                    required
                    rows={9}
                    value={String(fields.jd_text || "")}
                    onChange={(e) => set("jd_text", e.target.value)}
                  />
                </Field>
                {Array.isArray(action.fields.role_records) && action.fields.role_records.length > 0 && (
                  <section className="ws-panel" aria-label={t("Related client records")}>
                    <h3>{t("Related client records")}</h3>
                    <p className="ws-muted">{t("These records will be saved with this role.")}</p>
                    {(action.fields.role_records as Array<{ title: string; content: string; occurred_at: string | null }>).map((record, index) => (
                      <div key={index}>
                        <strong>{record.title}</strong>
                        <p className="ws-muted">{record.occurred_at ? date(record.occurred_at, true) : t("Event time not recorded")}</p>
                        <p className="whitespace-pre-wrap">{record.content}</p>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
            {(["priorities", "flexible", "unknowns"] as const).map((key) => (
              <Field
                key={key}
                label={t(
                  {
                    priorities: "Confirmed priorities",
                    flexible: "Flexible requirements",
                    unknowns: "Still to clarify",
                  }[key]
                )}
              >
                <textarea
                  value={(
                    (fields.brief as Record<string, string[]>)[key] || []
                  ).join("\n")}
                  onChange={(e) =>
                    set("brief", {
                      ...(fields.brief as object),
                      [key]: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                />
              </Field>
            ))}
          </>
        ) : (
          <>
            {action.kind === "update_sharing_permission" && (
              <section className="ws-panel">
                <p className="ws-muted">
                  {t("Saving creates a source record and updates sharing permission for this role. It does not send a recommendation.")}
                </p>
                <Field label={t("Sharing permission")}>
                  <input
                    readOnly
                    value={t(String(fields.permission))}
                  />
                </Field>
              </section>
            )}
            <Field label={t("Record type")}>
              <select
                value={String(fields.kind)}
                onChange={(e) => set("kind", e.target.value)}
              >
                {["note", "call", "email", "feedback"].map((kind) => (
                  <option key={kind} value={kind}>{t(kind)}</option>
                ))}
              </select>
            </Field>
            <Field label={t("Record")}>
              <textarea
                required
                rows={9}
                value={String(fields.content || "")}
                onChange={(e) => set("content", e.target.value)}
              />
            </Field>
          </>
        )}
        {action.kind !== "create_role" && (
          <Field
            label={t("When it happened")}
            hint={t(
              "Leave this blank if the event date is unknown. The save time is recorded separately.",

        )}
            >
              <input
                type="datetime-local"
                value={
                  fields.occurred_at
                    ? new Date(
                        new Date(String(fields.occurred_at)).getTime() -
                          new Date(
                            String(fields.occurred_at),
                          ).getTimezoneOffset() *
                            60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
                onChange={(e) =>
                  set(
                    "occurred_at",
                    e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  )
                }
              />
            </Field>
        )}
        <div className="ws-form-footer">
          <button
            type="button"
            className="ws-button"
            onClick={close}
            disabled={saving}
          >
            {t("Cancel")}
          </button>
          <button className="ws-button ws-button-primary" disabled={saving}>
            {saving
              ? t("Saving…")
              : action.kind === "create_role"
                ? t("Save role")
                : action.kind === "update_role_brief"
                  ? t("Apply requirements")
                  : action.kind === "update_sharing_permission"
                    ? t("Save permission and record")
                  : t("Save record")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

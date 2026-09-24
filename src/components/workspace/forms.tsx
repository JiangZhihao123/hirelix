"use client";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { api, Dialog, Field, ErrorNotice } from "./client";
import {
  personInput,
  roleInput,
  type Person,
  type PersonInput,
  type Role,
  type SourceRecord,
} from "@/lib/workspace/types";

export function PersonForm({
  person,
  onClose,
  onSaved,
  initialValues,
  saveOverride,
  title,
}: {
  initialValues?: Partial<PersonInput>;
  saveOverride?: (fields: PersonInput) => Promise<Person>;
  title?: string;
  person?: Person;
  onClose: () => void;
  onSaved: (person: Person) => void;
}) {
  const initial = person || initialValues;
  const [fields, setFields] = useState(() => {
    const defaults = personInput.parse({ name: "New candidate" });
    return {
      ...defaults,
      ...initial,
      name: initial?.name || "",
      headline: initial?.headline || "",
      location: initial?.location || "",
      email: initial?.email || "",
      phone: initial?.phone || "",
      skills: initial?.skills || [],
      profile_url: initial?.profile_url || "",
      note: initial?.note || "",
      profile: { ...defaults.profile, ...initial?.profile },
    };
  });
  const [name, setName] = useState(initial?.name || ""),
    [skills, setSkills] = useState((initial?.skills || []).join(", "));
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false);
  function set(key: keyof typeof fields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }
  function close() {
    if (
      !saving &&
      (!dirty || window.confirm("Discard your unsaved candidate changes?"))
    )
      onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const input = personInput.parse({
        ...fields,
        name,
        skills: skills
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      if (saveOverride) {
        onSaved(await saveOverride(input));
        return;
      }
      const result = await api<{ person: Person }>(
        person ? `/people/${person.id}` : "/people",
        {
          method: person ? "PATCH" : "POST",
          body: JSON.stringify({
            ...input,
            ...(person ? { expected_version: person.version } : {}),
          }),
        },
      );
      onSaved(result.person);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save candidate",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      title={title || (person ? "Edit candidate" : "Add candidate")}
      onClose={close}
      wide
    >
      <form autoComplete="off" className="ws-form" onSubmit={submit}>
        <ErrorNotice error={error} />
        <div className="ws-fields">
          <Field label="Full name">
            <input
              autoFocus
              required
              value={name}
              maxLength={200}
              onChange={(event) => {
                setName(event.target.value);
                setDirty(true);
              }}
            />
          </Field>
          <Field label="Current role / headline">
            <input
              value={fields.headline}
              maxLength={500}
              onChange={(event) => set("headline", event.target.value)}
            />
          </Field>
          <Field label="Location">
            <input
              value={fields.location}
              maxLength={250}
              onChange={(event) => set("location", event.target.value)}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={fields.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              value={fields.phone}
              maxLength={100}
              onChange={(event) => set("phone", event.target.value)}
            />
          </Field>
          <Field label="Profile URL">
            <input
              type="url"
              value={fields.profile_url}
              onChange={(event) => set("profile_url", event.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Expertise"
          hint="Separate skills or areas of expertise with commas."
        >
          <input
            value={skills}
            onChange={(event) => {
              setSkills(event.target.value);
              setDirty(true);
            }}
          />
        </Field>
        <Field label="Professional summary">
          <textarea
            rows={3}
            value={fields.profile.summary}
            maxLength={10000}
            onChange={(event) => {
              setFields((current) => ({
                ...current,
                profile: { ...current.profile, summary: event.target.value },
              }));
              setDirty(true);
            }}
          />
        </Field>
        <Field
          label="Your private note"
          hint="Kept in this person's record. You choose which notes to include in client material."
        >
          <textarea
            rows={3}
            value={fields.note}
            maxLength={100000}
            onChange={(event) => set("note", event.target.value)}
          />
        </Field>
        <div className="ws-form-footer">
          <button
            className="ws-button"
            type="button"
            disabled={saving}
            onClick={close}
          >
            Cancel
          </button>
          <button className="ws-button ws-button-primary" disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Saving…" : "Save candidate"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function RoleForm({
  role,
  onClose,
  onSaved,
}: {
  role?: Role;
  onClose: () => void;
  onSaved: (role: Role) => void;
}) {
  const [fields, setFields] = useState(() =>
    roleInput.parse({
      ...role,
      title: role?.title || "New role",
      client_name: role?.client_name || "Client",
      jd_text: role?.jd_text || " ",
      brief: role?.brief || {},
      client_contact: role?.client_contact || {},
    }),
  );
  const [title, setTitle] = useState(role?.title || ""),
    [client, setClient] = useState(role?.client_name || ""),
    [jd, setJd] = useState(role?.jd_text || "");
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false);
  function close() {
    if (
      !saving &&
      (!dirty || window.confirm("Discard your unsaved role changes?"))
    )
      onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const input = roleInput.parse({
        ...fields,
        title,
        client_name: client,
        jd_text: jd,
      });
      const result = await api<{ role: Role }>(
        role ? `/roles/${role.id}` : "/roles",
        {
          method: role ? "PATCH" : "POST",
          body: JSON.stringify({
            ...input,
            ...(role ? { expected_version: role.version } : {}),
          }),
        },
      );
      onSaved(result.role);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save role");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog title={role ? "Edit role" : "Add a role"} onClose={close} wide>
      <form
        autoComplete="off"
        className="ws-form"
        onSubmit={submit}
        onChange={() => setDirty(true)}
      >
        <ErrorNotice error={error} />
        <div className="ws-fields">
          <Field label="Role title">
            <input
              autoFocus
              required
              value={title}
              maxLength={300}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="Client">
            <input
              required
              value={client}
              maxLength={300}
              onChange={(event) => setClient(event.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Job description"
          hint="Paste the original JD. You can refine the working requirements below."
        >
          <textarea
            rows={7}
            required
            value={jd}
            maxLength={100000}
            onChange={(event) => setJd(event.target.value)}
          />
        </Field>
        {(
          [
            ["priorities", "Confirmed priorities"],
            ["flexible", "Flexible requirements"],
            ["unknowns", "Still to clarify"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label} hint="One item per line.">
            <textarea
              rows={2}
              value={fields.brief[key].join("\n")}
              onChange={(event) =>
                setFields((current) => ({
                  ...current,
                  brief: {
                    ...current.brief,
                    [key]: event.target.value.split("\n"),
                  },
                }))
              }
            />
          </Field>
        ))}
        <details>
          <summary className="ws-link">
            Client contact and practical details
          </summary>
          <div className="ws-fields mt-4">
            {(
              [
                ["name", "Contact name"],
                ["email", "Contact email"],
                ["cooperation", "Cooperation terms"],
                ["location", "Role location"],
                ["compensation", "Compensation"],
              ] as const
            ).map(([key, label]) => (
              <Field label={label} key={key}>
                <input
                  type={key === "email" ? "email" : "text"}
                  value={fields.client_contact[key]}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      client_contact: {
                        ...current.client_contact,
                        [key]: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
            ))}
          </div>
        </details>
        <div className="ws-form-footer">
          <button
            className="ws-button"
            type="button"
            disabled={saving}
            onClick={close}
          >
            Cancel
          </button>
          <button className="ws-button ws-button-primary" disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Saving…" : "Save role"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function RecordForm({
  personId,
  roleId,
  record,
  onClose,
  onSaved,
}: {
  personId?: string;
  roleId?: string;
  record?: SourceRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<SourceRecord["kind"]>(
      record?.kind || "note",
    ),
    [title, setTitle] = useState(record?.title || ""),
    [content, setContent] = useState(record?.content || ""),
    [url, setUrl] = useState(record?.source_url || "");
  const [occurred, setOccurred] = useState(() => {
    if (!record?.occurred_at) return "";
    const date = new Date(record.occurred_at);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  function close() {
    if (!saving && (!dirty || window.confirm("Discard this unsaved record?")))
      onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(record ? `/records/${record.id}` : "/records", {
        method: record ? "PATCH" : "POST",
        body: JSON.stringify({
          person_id: record?.person_id || personId || null,
          role_id: record?.role_id || roleId || null,
          file_id: record?.file_id || null,
          kind,
          title,
          content,
          source_url: url,
          occurred_at: occurred ? new Date(occurred).toISOString() : null,
          details: record?.details || {},
          ...(record ? { expected_version: record.version } : {}),
        }),
      });
      onSaved();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save record",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog title={record ? "Edit record" : "Add a record"} onClose={close}>
      <form
        autoComplete="off"
        className="ws-form"
        onSubmit={submit}
        onChange={() => setDirty(true)}
      >
        <ErrorNotice error={error} />
        <div className="ws-fields">
          <Field label="Record type">
            <select
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as SourceRecord["kind"])
              }
            >
              {["note", "call", "email", "feedback", "profile", "event"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </option>
                ),
              )}
            </select>
          </Field>
          <Field
            label="When it happened"
            hint="Your local time. Leave blank if unknown; adding a record does not imply it happened today."
          >
            <input
              type="datetime-local"
              value={occurred}
              onChange={(event) => setOccurred(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Title">
          <input
            autoFocus
            required
            value={title}
            maxLength={500}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label="Original note or message">
          <textarea
            required
            rows={7}
            value={content}
            maxLength={500000}
            onChange={(event) => setContent(event.target.value)}
          />
        </Field>
        <Field label="Source URL (optional)">
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </Field>
        <div className="ws-form-footer">
          <button
            type="button"
            disabled={saving}
            onClick={close}
            className="ws-button"
          >
            Cancel
          </button>
          <button disabled={saving} className="ws-button ws-button-primary">
            {saving ? "Saving…" : "Save record"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

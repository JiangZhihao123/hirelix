"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUp,
  ArrowUpRight,
  Plus,
  Paperclip,
  MessageSquare,
  Check,
  Loader2,
  X,
} from "lucide-react";
import { AgentText } from "@/components/AgentText";
import {
  api,
  useQuery,
  ErrorNotice,
  Loading,
  Dialog,
  Field,
  date,
} from "@/components/workspace/client";
import { ConversationImport } from "@/components/workspace/import-review";
import { RoleForm } from "@/components/workspace/forms";
import type {
  Conversation,
  Message,
  Job,
  Role,
  Person,
} from "@/lib/workspace/types";
import type {
  AssistantAction,
  AssistantMeta,
} from "@/lib/workspace/conversations";

type Detail = {
  conversation: Conversation;
  messages: Message[];
  job: Job | null;
};
export default function AssistantHome() {
  const params = useSearchParams(),
    router = useRouter();
  const conversationId = params.get("conversation");
  const roleId = params.get("role"),
    personId = params.get("person");
  return (
    <AssistantWorkspace
      key={`${conversationId || "new"}:${roleId || ""}:${personId || ""}`}
      conversationId={conversationId}
      initialRoleId={roleId}
      personId={personId}
      initialPrompt={params.get("prompt") || ""}
      onOpen={(id) => router.push(`/app?conversation=${id}`)}
    />
  );
}
function AssistantWorkspace({
  conversationId,
  initialRoleId,
  personId,
  initialPrompt,
  onOpen,
}: {
  conversationId: string | null;
  initialRoleId: string | null;
  personId: string | null;
  initialPrompt: string;
  onOpen: (id: string) => void;
}) {
  const list = useQuery<{ conversations: Conversation[] }>("/conversations"),
    roles = useQuery<{ roles: Role[] }>("/roles");
  const query = useQuery<Detail>(
    conversationId ? `/conversations/${conversationId}` : null,
  );
  const [roleId, setRoleId] = useState(initialRoleId || ""),
    [draft, setDraft] = useState(initialPrompt),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [addingRole, setAddingRole] = useState(false),
    [review, setReview] = useState<{
      messageId: string;
      action: AssistantAction;
    } | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentKey, setAttachmentKey] = useState(() => crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  function chooseFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError("Choose a file up to 4 MB.");
      return;
    }
    if (!/\.(csv|pdf|docx)$/i.test(file.name)) {
      setError("Attach a CSV, text PDF or DOCX candidate file.");
      return;
    }
    setAttachment(file);
    setAttachmentKey(crypto.randomUUID());
    setError("");
    composer.current?.focus();
  }
  const request = useRef<{ text: string; key: string } | null>(null),
    scroll = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  const job = query.data?.job;
  const pending = !!job && ["queued", "running"].includes(job.status);
  const activeRoleId = query.data?.conversation.role_id || roleId;
  const activeRole = roles.data?.roles.find((r) => r.id === activeRoleId);
  const activePersonId = query.data?.conversation.person_id || personId;
  const person = useQuery<{ person: Person }>(
    activePersonId ? `/people/${activePersonId}` : null,
  );
  const roleDetail = useQuery<{
    role: Role;
    people: unknown[];
    records: unknown[];
    deliverables: Array<{
      id: string;
      title: string;
      kind: string;
      status: string;
    }>;
  }>(activeRoleId ? `/roles/${activeRoleId}` : null);
  useEffect(() => {
    if (!conversationId || !pending) return;
    const timer = setInterval(query.refresh, 2000);
    return () => clearInterval(timer);
  }, [conversationId, pending, query.refresh]);
  const count = query.data?.messages.length || 0;
  useEffect(() => {
    scroll.current?.scrollTo({
      top: scroll.current.scrollHeight,
      behavior: "instant",
    });
  }, [count, pending]);
  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !attachment) || sending || pending) return;
    setSending(true);
    setError("");
    if (request.current?.text !== text)
      request.current = { text, key: crypto.randomUUID() };
    try {
      if (attachment) {
        const form = new FormData();
        form.append("file", attachment);
        form.append("request_key", attachmentKey);
        form.append("in_conversation", "true");
        form.append("message", text);
        if (conversationId) form.append("conversation_id", conversationId);
        if (!conversationId && roleId) form.append("role_id", roleId);
        if (!conversationId && personId) form.append("person_id", personId);
        const uploaded = await api<{ job: Job }>("/imports", {
          method: "POST",
          body: form,
        });
        setAttachment(null);
        setDraft("");
        setAttachmentKey(crypto.randomUUID());
        if (fileInput.current) fileInput.current.value = "";
        const target = String(uploaded.job.payload.conversation_id);
        if (!conversationId) onOpen(target);
        else query.refresh();
        list.refresh();
        return;
      }
      const result = await api<{ conversation_id: string }>("/conversations", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          request_key: request.current.key,
          conversation_id: conversationId,
          role_id: conversationId ? null : roleId || null,
          person_id: conversationId ? null : personId,
        }),
      });
      setDraft("");
      request.current = null;
      if (!conversationId) onOpen(result.conversation_id);
      else query.refresh();
      list.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save your message",
      );
    } finally {
      setSending(false);
    }
  }
  async function retry() {
    if (!job) return;
    try {
      await api(`/jobs/${job.id}`, { method: "POST" });
      query.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not retry");
    }
  }
  function prompt(text: string) {
    setDraft(text);
    composer.current?.focus();
  }
  return (
    <div className="ws-page ws-assistant-page">
      <div className="ws-assistant-body">
        <section className="ws-conversation" aria-label="My assistant">
          <header className="ws-conversation-header">
            <div>
              <span className="ws-eyebrow">YOUR PRIVATE ASSISTANT</span>
              <h1>
                {conversationId
                  ? "Let’s pick up the work."
                  : "What are we working on?"}
              </h1>
              <p>
                Keep your candidates, client roles and recommendations
                connected.
              </p>
            </div>
            {conversationId && (
              <Link className="ws-button" href="/app">
                <Plus size={14} />
                New conversation
              </Link>
            )}
          </header>
          <ErrorNotice
            error={error || query.error || roles.error}
            retry={
              query.error
                ? query.refresh
                : roles.error
                  ? roles.refresh
                  : undefined
            }
          />
          <div
            ref={scroll}
            className="ws-conversation-scroll"
            aria-live="polite"
            aria-busy={pending}
          >
            {conversationId && !query.data ? (
              query.loading ? (
                <Loading>Opening your conversation…</Loading>
              ) : null
            ) : !count ? (
              <div className="ws-assistant-start">
                <div className="ws-assistant-mark">
                  <MessageSquare size={20} />
                </div>
                <h2>Your work can start here.</h2>
                <p>
                  Bring a client’s JD, a conversation with a candidate, or a
                  recommendation you need to prepare. I’ll help you work with
                  what you have.
                </p>
                <div className="ws-starters">
                  <button
                    onClick={() => prompt("Find a candidate in my pool who ")}
                  >
                    Find a candidate <ArrowUpRight size={14} />
                  </button>
                  <button
                    onClick={() =>
                      prompt(
                        "I have a new client role. Help me set it up from this JD:\n\nClient: \n\n",
                      )
                    }
                  >
                    Work on a client role <ArrowUpRight size={14} />
                  </button>
                  <button
                    onClick={() =>
                      prompt("Help me prepare a candidate submission for ")
                    }
                  >
                    Draft a submission <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="ws-first-step">
                  <span>Starting with your existing candidates?</span>
                  <button
                    className="ws-link"
                    onClick={() => fileInput.current?.click()}
                  >
                    Attach a CSV or CV <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>
            ) : (
              query.data?.messages.map((message) => {
                const metadata = message.metadata as AssistantMeta;
                return (
                  <article
                    className={`ws-message ws-message-${message.role}`}
                    key={message.id}
                  >
                    <div className="ws-message-label">
                      {message.role === "user" ? "You" : "Hirelix"}
                      <time>{date(message.created_at)}</time>
                    </div>
                    <div className="ws-message-prose">
                      <AgentText content={message.content} />
                      {message.metadata.attachment ? (
                        <span className="ws-chat-attachment">
                          <Paperclip size={14} />
                          {String(
                            (message.metadata.attachment as { name: string })
                              .name,
                          )}
                        </span>
                      ) : null}
                    </div>
                    {typeof message.metadata.import_job_id === "string" && (
                      <ConversationImport
                        jobId={message.metadata.import_job_id}
                      />
                    )}
                    {metadata.sources?.length ? (
                      <div className="ws-message-sources">
                        {metadata.sources.map((source, index) => (
                          <Link key={index} href={source.href}>
                            {source.title}
                            <ArrowUpRight size={12} />
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    {metadata.actions?.map((action) => (
                      <div className="ws-action-proposal" key={action.id}>
                        <div>
                          <strong>{action.title}</strong>
                          <small>
                            {action.status === "saved"
                              ? "Saved to your workspace"
                              : action.kind === "create_role"
                                ? "Review the role details before saving"
                                : action.kind === "update_role_brief"
                                  ? "Review the proposed requirements before applying"
                                  : action.kind === "add_record"
                                    ? "Review this record before adding it"
                                    : "Choose the people and source material to include"}
                          </small>
                        </div>
                        {action.href ? (
                          <Link className="ws-button" href={action.href}>
                            {action.status === "saved" ? (
                              <Check size={13} />
                            ) : null}
                            {action.status === "saved" ? "Open" : "Prepare"}
                            <ArrowUpRight size={13} />
                          </Link>
                        ) : (
                          <button
                            className="ws-button"
                            onClick={() =>
                              setReview({ messageId: message.id, action })
                            }
                          >
                            Review & save
                          </button>
                        )}
                      </div>
                    ))}
                  </article>
                );
              })
            )}
            {(pending || sending) && (
              <div className="ws-assistant-working" role="status">
                <Loader2 size={14} className="animate-spin" />
                {sending
                  ? "Saving your message…"
                  : job?.progress || "Working on your request…"}
                <span>You can leave this page and return.</span>
              </div>
            )}
            {job?.status === "error" && (
              <ErrorNotice
                error={
                  job.error ||
                  "This reply needs another attempt. Your message is saved."
                }
                retry={retry}
              />
            )}
          </div>
          <form
            className="ws-composer"
            onSubmit={send}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!sending) chooseFile(e.dataTransfer.files[0]);
            }}
          >
            <input
              ref={fileInput}
              className="sr-only"
              tabIndex={-1}
              aria-label="Attach candidate file"
              type="file"
              accept=".csv,.pdf,.docx"
              onChange={(e) => chooseFile(e.target.files?.[0])}
            />
            {attachment && (
              <div className="ws-composer-attachment">
                <Paperclip size={14} />
                <span>
                  {attachment.name}
                  <small>
                    {attachment.size < 1024
                      ? `${attachment.size} bytes`
                      : `${(attachment.size / 1024).toFixed(0)} KB`}{" "}
                    · Candidate import
                  </small>
                </span>
                <button
                  className="ws-icon"
                  type="button"
                  aria-label="Remove attachment"
                  disabled={sending}
                  onClick={() => {
                    setAttachment(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {!conversationId && (
              <div className="ws-composer-context">
                <label>
                  Working on{" "}
                  <select
                    aria-label="Conversation role"
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                  >
                    <option value="">My workspace</option>
                    {roles.data?.roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.client_name} · {role.title}
                      </option>
                    ))}
                  </select>
                </label>
                {person.data && <span>{person.data.person.name}</span>}
              </div>
            )}
            {conversationId && activeRole && (
              <Link
                className="ws-context-chip"
                href={`/app/roles/${activeRole.id}`}
              >
                {activeRole.client_name} · {activeRole.title}
                <ArrowUpRight size={12} />
              </Link>
            )}
            <textarea
              ref={composer}
              aria-label="Message your assistant"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask, paste a JD, or share a conversation note…"
              rows={3}
              maxLength={50000}
              disabled={sending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="ws-composer-footer">
              <button
                type="button"
                className="ws-attach-button"
                disabled={sending}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={14} />
                Attach candidates
              </button>
              <span>⌘ / Ctrl + Enter to send</span>
              <button
                type="submit"
                className="ws-button ws-button-primary"
                aria-label="Send message"
                disabled={
                  (!draft.trim() && !attachment) ||
                  sending ||
                  pending ||
                  job?.status === "error"
                }
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </form>
        </section>
        <aside className="ws-assistant-context" aria-label="Current work">
          <section>
            <h2>Working on</h2>
            {activeRole ? (
              <>
                <Link
                  className="ws-context-role"
                  href={`/app/roles/${activeRole.id}`}
                >
                  <span>{activeRole.client_name}</span>
                  <strong>{activeRole.title}</strong>
                  <small>
                    {activeRole.status} <ArrowUpRight size={12} />
                  </small>
                </Link>
                {roleDetail.data && (
                  <p>
                    {roleDetail.data.people.length} candidates ·{" "}
                    {roleDetail.data.records.length} records
                  </p>
                )}
                <Link
                  className="ws-detail-link"
                  href={`/app/submissions/new?role=${activeRole.id}`}
                >
                  Prepare a submission <ArrowUpRight size={12} />
                </Link>
              </>
            ) : (
              <>
                <p>
                  Select a role when your conversation relates to a client
                  assignment.
                </p>
                <button
                  className="ws-text-button"
                  onClick={() => setAddingRole(true)}
                >
                  <Plus size={13} />
                  Add a role
                </button>
              </>
            )}
            {person.data && (
              <Link
                className="ws-detail-link"
                href={`/app/candidates?person=${person.data.person.id}`}
              >
                <strong>{person.data.person.name}</strong>
                <small>{person.data.person.headline}</small>
              </Link>
            )}
          </section>
          <section>
            <h2>
              Client roles <Link href="/app/roles">View all</Link>
            </h2>
            {roles.data?.roles
              .filter((r) => r.status === "active")
              .slice(0, 4)
              .map((role) => (
                <Link
                  key={role.id}
                  className="ws-detail-link"
                  href={`/app?role=${role.id}`}
                >
                  <strong>{role.title}</strong>
                  <small>{role.client_name}</small>
                </Link>
              ))}
            {roles.data && !roles.data.roles.length && (
              <p>Add your first client role from its JD.</p>
            )}
          </section>
          {roleDetail.data?.deliverables.filter((d) => d.status === "draft")
            .length ? (
            <section>
              <h2>Drafts to finish</h2>
              {roleDetail.data.deliverables
                .filter((d) => d.status === "draft")
                .map((d) => (
                  <Link
                    className="ws-detail-link"
                    href={
                      d.kind === "search_update"
                        ? `/app/roles/${activeRoleId}/updates/${d.id}`
                        : `/app/submissions/${d.id}`
                    }
                    key={d.id}
                  >
                    {d.title}
                  </Link>
                ))}
            </section>
          ) : null}
          <section>
            <h2>
              Recent conversations <Link href="/app">New</Link>
            </h2>
            <ErrorNotice error={list.error} retry={list.refresh} />
            {list.data?.conversations.slice(0, 8).map((c) => (
              <Link
                className="ws-detail-link ws-conversation-link"
                href={`/app?conversation=${c.id}`}
                key={c.id}
                aria-current={c.id === conversationId ? "page" : undefined}
              >
                <strong>{c.title}</strong>
                <small>{date(c.updated_at)}</small>
              </Link>
            ))}
            {list.data && !list.data.conversations.length && (
              <p>Your saved conversations will appear here.</p>
            )}
          </section>
        </aside>
      </div>
      {addingRole && (
        <RoleForm
          onClose={() => setAddingRole(false)}
          onSaved={(role) => {
            setAddingRole(false);
            roles.refresh();
            setRoleId(role.id);
          }}
        />
      )}
      {review && conversationId && (
        <ActionReview
          conversationId={conversationId}
          messageId={review.messageId}
          action={review.action}
          onClose={() => setReview(null)}
          onSaved={() => {
            setReview(null);
            query.refresh();
            roles.refresh();
            list.refresh();
          }}
        />
      )}
    </div>
  );
}
function ActionReview({
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
      (!dirty || window.confirm("Discard your edits to this proposal?"))
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
  return (
    <Dialog
      title={
        action.kind === "create_role"
          ? "Review new role"
          : action.kind === "update_role_brief"
            ? "Review updated requirements"
            : "Review conversation record"
      }
      onClose={close}
      wide
    >
      <form className="ws-form" onSubmit={save} autoComplete="off">
        <ErrorNotice error={error} />
        <Field label="Title">
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
                  The original JD is preserved. Review the complete requirements
                  below; accepting saves a new version and the original
                  feedback.
                </p>
                <p className="whitespace-pre-wrap">
                  {String(fields.feedback || "")}
                </p>
                <details>
                  <summary>Previous requirements</summary>
                  {(["priorities", "flexible", "unknowns"] as const).map(
                    (key) => (
                      <div key={key}>
                        <strong>
                          {
                            {
                              priorities: "Priorities",
                              flexible: "Flexible requirements",
                              unknowns: "Still to clarify",
                            }[key]
                          }
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
                <Field label="Client">
                  <input
                    required
                    value={String(fields.client_name || "")}
                    onChange={(e) => set("client_name", e.target.value)}
                  />
                </Field>
                <Field label="Original job description">
                  <textarea
                    required
                    rows={9}
                    value={String(fields.jd_text || "")}
                    onChange={(e) => set("jd_text", e.target.value)}
                  />
                </Field>
              </>
            )}
            {(["priorities", "flexible", "unknowns"] as const).map((key) => (
              <Field
                key={key}
                label={
                  {
                    priorities: "Confirmed priorities",
                    flexible: "Flexible requirements",
                    unknowns: "Still to clarify",
                  }[key]
                }
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
            <Field label="Record type">
              <select
                value={String(fields.kind)}
                onChange={(e) => set("kind", e.target.value)}
              >
                {["note", "call", "email", "feedback"].map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </Field>
            <Field label="Record">
              <textarea
                required
                rows={9}
                value={String(fields.content || "")}
                onChange={(e) => set("content", e.target.value)}
              />
            </Field>
            <Field
              label="When it happened"
              hint="Leave empty if the date was not recorded. Saving time is kept separately."
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
          </>
        )}
        <div className="ws-form-footer">
          <button
            type="button"
            className="ws-button"
            onClick={close}
            disabled={saving}
          >
            Cancel
          </button>
          <button className="ws-button ws-button-primary" disabled={saving}>
            {saving
              ? "Saving…"
              : action.kind === "create_role"
                ? "Save role"
                : action.kind === "update_role_brief"
                  ? "Apply requirements"
                  : "Save record"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

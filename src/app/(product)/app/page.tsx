"use client";

import { useLanguage, useT } from "@/components/LanguageProvider";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
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
  PanelLeft,
  Search,
  Pencil,
  Copy,
  ChevronsDown,
  BriefcaseBusiness,
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
  const [handoff, setHandoff] = useState<{
    conversationId: string;
    text: string;
  } | null>(null);
  return (
    <AssistantWorkspace
      key={`${conversationId || "new"}:${roleId || ""}:${personId || ""}`}
      conversationId={conversationId}
      initialRoleId={roleId}
      personId={personId}
      initialPrompt={params.get("prompt") || ""}
      handoffText={
        handoff?.conversationId === conversationId ? handoff.text : null
      }
      onHandoffSettled={() => setHandoff(null)}
      onOpen={(id, text) => {
        if (text) setHandoff({ conversationId: id, text });
        router.push(`/app?conversation=${id}`);
      }}
    />
  );
}
function AssistantWorkspace({
  conversationId,
  initialRoleId,
  personId,
  initialPrompt,
  handoffText,
  onHandoffSettled,
  onOpen,
}: {
  conversationId: string | null;
  initialRoleId: string | null;
  personId: string | null;
  initialPrompt: string;
  handoffText: string | null;
  onHandoffSettled: () => void;
  onOpen: (id: string, text?: string) => void;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const list = useQuery<{ conversations: Conversation[] }>("/conversations"),
    roles = useQuery<{ roles: Role[] }>("/roles");
  const opening = useQuery<{
    message: string;
    suggested_prompt: string;
    role_id: string | null;
  }>(!conversationId ? `/conversations/opening?locale=${locale}` : null);
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [optimistic, setOptimistic] = useState<{
    text: string;
    priorIds: string[];
  } | null>(handoffText ? { text: handoffText, priorIds: [] } : null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);
  function chooseFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError("Choose a file up to 4 MB.");
      return;
    }
    if (!/\.(csv|pdf|docx|txt|md)$/i.test(file.name)) {
      setError("Attach a CSV, text PDF, DOCX, TXT or Markdown file.");
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
  const draftStorageKey = `hirelix:assistant:draft:${conversationId || "new"}`;
  useEffect(() => {
    if (!initialPrompt) setDraft(localStorage.getItem(draftStorageKey) || "");
    setDraftReady(true);
  }, [draftStorageKey, initialPrompt]);
  useEffect(() => {
    if (!draftReady) return;
    if (draft) localStorage.setItem(draftStorageKey, draft);
    else localStorage.removeItem(draftStorageKey);
  }, [draft, draftReady, draftStorageKey]);
  useEffect(() => {
    const field = composer.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 220)}px`;
  }, [draft]);
  useEffect(() => {
    if (!contextOpen && !historyOpen) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setContextOpen(false);
        setHistoryOpen(false);
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (
        contextOpen &&
        event.target instanceof Element &&
        !event.target.closest(".ws-assistant-context, .ws-chat-context-trigger")
      ) {
        setContextOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [contextOpen, historyOpen]);
  useEffect(() => {
    if (!conversationId || !pending) return;
    const timer = setInterval(query.refresh, 2000);
    return () => clearInterval(timer);
  }, [conversationId, pending, query.refresh]);
  useEffect(() => {
    if (!optimistic || !query.data) return;
    if (
      query.data.messages.some(
        (message) =>
          message.role === "user" && !optimistic.priorIds.includes(message.id),
      )
    ) {
      setOptimistic(null);
      if (handoffText) onHandoffSettled();
    }
  }, [optimistic, query.data, handoffText, onHandoffSettled]);
  const count = query.data?.messages.length || 0;
  useEffect(() => {
    if (!count && !pending && !optimistic) {
      if (scroll.current) scroll.current.scrollTop = 0;
      return;
    }
    if (stickToBottom.current && scroll.current) {
      scroll.current.scrollTop = scroll.current.scrollHeight;
      setShowJump(false);
    } else if (count || pending || optimistic) setShowJump(true);
  }, [count, pending, optimistic]);
  function jumpToLatest() {
    stickToBottom.current = true;
    scroll.current?.scrollTo({
      top: scroll.current.scrollHeight,
      behavior: "smooth",
    });
    setShowJump(false);
  }
  async function rename(event: FormEvent) {
    event.preventDefault();
    if (!conversationId || !renameDraft.trim()) return;
    try {
      await api(`/conversations/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: renameDraft.trim() }),
      });
      setRenaming(false);
      list.refresh();
      query.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not rename this conversation",
      );
    }
  }
  async function copyMessage(id: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      window.setTimeout(
        () => setCopiedId((current) => (current === id ? null : current)),
        2000,
      );
    } catch {
      setError("Could not copy this message");
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !attachment) || sending || pending) return;
    setSending(true);
    setError("");
    stickToBottom.current = true;
    setShowJump(false);
    if (!attachment)
      setOptimistic({
        text,
        priorIds: query.data?.messages.map((m) => m.id) || [],
      });
    if (request.current?.text !== text)
      request.current = { text, key: crypto.randomUUID() };
    try {
      if (attachment) {
        const form = new FormData();
        form.append("file", attachment);
        form.append("request_key", attachmentKey);
        form.append("message", text);
        form.append("locale", locale);
        if (conversationId) form.append("conversation_id", conversationId);
        if (!conversationId && roleId) form.append("role_id", roleId);
        if (!conversationId && personId) form.append("person_id", personId);
        const uploaded = await api<{ conversation_id: string }>("/conversations", {
          method: "POST",
          body: form,
        });
        setAttachment(null);
        setDraft("");
        localStorage.removeItem(draftStorageKey);
        setAttachmentKey(crypto.randomUUID());
        if (fileInput.current) fileInput.current.value = "";
        const target = uploaded.conversation_id;
        if (!conversationId) onOpen(target);
        else query.refresh();
        list.refresh();
        return;
      }
      const result = await api<{ conversation_id: string }>("/conversations", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          locale,
          request_key: request.current.key,
          conversation_id: conversationId,
          role_id: conversationId ? null : roleId || null,
          person_id: conversationId ? null : personId,
        }),
      });
      setDraft("");
      localStorage.removeItem(draftStorageKey);
      request.current = null;
      if (!conversationId) onOpen(result.conversation_id, text);
      else query.refresh();
      list.refresh();
    } catch (cause) {
      setOptimistic(null);
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
  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    if (!pending && !sending) event.currentTarget.form?.requestSubmit();
  }
  return (
    <div className="ws-page ws-assistant-page">
      <div className="ws-assistant-body">
        {historyOpen && (
          <button
            className="ws-history-backdrop"
            aria-label={t("Close conversation history")}
            onClick={() => setHistoryOpen(false)}
          />
        )}
        <aside
          className={`ws-conversation-history ${historyOpen ? "is-open" : ""}`}
          aria-label={t("Conversation history")}
        >
          <div className="ws-history-heading">
            <strong>{t("Conversations")}</strong>
            <button
              type="button"
              className="ws-icon ws-history-close"
              aria-label={t("Close conversation history")}
              onClick={() => setHistoryOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          <Link
            className="ws-history-new"
            href="/app"
            onClick={() => setHistoryOpen(false)}
          >
            <Plus size={16} />
            {t("New conversation")}
          </Link>
          <label className="ws-history-search">
            <Search size={15} />
            <input
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              placeholder={t("Search conversations")}
              aria-label={t("Search conversations")}
            />
          </label>
          <div className="ws-history-list">
            <ErrorNotice error={list.error} retry={list.refresh} />
            {list.data?.conversations
              .filter((c) =>
                c.title
                  .toLocaleLowerCase()
                  .includes(historySearch.toLocaleLowerCase()),
              )
              .map((c) => (
                <Link
                  className="ws-history-item"
                  href={`/app?conversation=${c.id}`}
                  key={c.id}
                  aria-current={c.id === conversationId ? "page" : undefined}
                  onClick={() => setHistoryOpen(false)}
                >
                  <MessageSquare size={15} />
                  <span>
                    <strong>{c.title}</strong>
                    <small>{date(c.updated_at, true)}</small>
                  </span>
                </Link>
              ))}
            {list.data && !list.data.conversations.length && (
              <p className="ws-history-empty">
                {t("Your saved conversations will appear here.")}
              </p>
            )}
            {list.data &&
              !!list.data.conversations.length &&
              !list.data.conversations.some((c) =>
                c.title
                  .toLocaleLowerCase()
                  .includes(historySearch.toLocaleLowerCase()),
              ) && (
                <p className="ws-history-empty">
                  {t("No matching conversations")}
                </p>
              )}
          </div>
        </aside>
        <section className="ws-conversation" aria-label={t("My assistant")}>
          <header className="ws-conversation-header">
            <div className="ws-chat-title-row">
              <button
                type="button"
                className="ws-icon ws-history-toggle"
                aria-label={t("Open conversation history")}
                onClick={() => setHistoryOpen(true)}
              >
                <PanelLeft size={18} />
              </button>
              {renaming ? (
                <form className="ws-rename-form" onSubmit={rename}>
                  <input
                    autoFocus
                    aria-label={t("Conversation title")}
                    maxLength={100}
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setRenaming(false);
                    }}
                  />
                  <button
                    type="submit"
                    className="ws-icon"
                    aria-label={t("Save title")}
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    className="ws-icon"
                    aria-label={t("Cancel")}
                    onClick={() => setRenaming(false)}
                  >
                    <X size={16} />
                  </button>
                </form>
              ) : (
                <>
                  <h1
                    title={
                      query.data?.conversation.title || t("New conversation")
                    }
                  >
                    {query.data?.conversation.title || t("New conversation")}
                  </h1>
                  {conversationId && query.data && (
                    <button
                      type="button"
                      className="ws-icon ws-rename-button"
                      aria-label={t("Rename conversation")}
                      onClick={() => {
                        setRenameDraft(query.data!.conversation.title);
                        setRenaming(true);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="ws-chat-header-actions">
              {activeRole && (
                <Link
                  className="ws-chat-role"
                  href={`/app/roles/${activeRole.id}`}
                >
                  <BriefcaseBusiness size={14} />
                  <span>
                    {activeRole.client_name} · {activeRole.title}
                  </span>
                </Link>
              )}
              <button
                type="button"
                className={`ws-chat-context-trigger ${contextOpen ? "is-active" : ""}`}
                aria-expanded={contextOpen}
                onClick={() => setContextOpen(!contextOpen)}
              >
                {t("Workspace context")}
              </button>
            </div>
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
            onScroll={(event) => {
              const el = event.currentTarget;
              const nearBottom =
                el.scrollHeight - el.scrollTop - el.clientHeight < 100;
              stickToBottom.current = nearBottom;
              if (nearBottom) setShowJump(false);
            }}
          >
            {conversationId && !query.data ? (
              query.loading && !optimistic ? (
                <Loading>{t("Opening your conversation…")}</Loading>
              ) : null
            ) : !count && !optimistic ? (
              <div className="ws-assistant-start">
                <div className="ws-assistant-mark">
                  <MessageSquare size={20} />
                </div>
                <span className="ws-eyebrow">
                  {t("YOUR PRIVATE ASSISTANT")}
                </span>
                <h2>{t("Let's move the work forward.")}</h2>
                <p>
                  {opening.data?.message || t(
                    "Bring a client’s JD, a conversation with a candidate, or a recommendation you need to prepare. I’ll help you work with what you have.",
                  )}
                </p>
                {opening.data && (
                  <button
                    className="ws-opening-suggestion"
                    onClick={() => prompt(opening.data!.suggested_prompt)}
                  >
                    <span>{opening.data.suggested_prompt}</span>
                    <ArrowUpRight size={15} />
                  </button>
                )}
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
                      <span
                        className={`ws-message-avatar ws-message-avatar-${message.role}`}
                      >
                        {message.role === "user" ? t("You").slice(0, 1) : "h"}
                      </span>
                      <strong>
                        {message.role === "user" ? t("You") : t("Hirelix")}
                      </strong>
                      <time>{date(message.created_at, true)}</time>
                    </div>
                    <div className="ws-message-prose">
                      <AgentText content={message.content} />
                      {message.metadata.attachment ? (
                        <a
                          className="ws-chat-attachment"
                          href={`/api/workspace/files/${String((message.metadata.attachment as { file_id: string }).file_id)}`}
                        >
                          <Paperclip size={14} />
                          {String(
                            (message.metadata.attachment as { name: string })
                              .name,
                          )}
                        </a>
                      ) : null}
                    </div>
                    {typeof message.metadata.import_job_id === "string" && (
                      <ConversationImport
                        jobId={message.metadata.import_job_id}
                        embedded={message.role === "assistant"}
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
                              ? t("Saved to your workspace")
                              : action.kind === "create_role"
                                ? t("Review the role details before saving")
                                : action.kind === "update_role_brief"
                                  ? t(
                                      "Review the proposed requirements before applying",
                                    )
                                  : action.kind === "add_record"
                                    ? t("Review this record before adding it")
                                    : t(
                                        "Choose the people and source material to include",
                                      )}
                          </small>
                        </div>
                        {action.href ? (
                          <Link className="ws-button" href={action.href}>
                            {action.status === "saved" ? (
                              <Check size={13} />
                            ) : null}
                            {action.status === "saved"
                              ? t("Open")
                              : t("Prepare")}
                            <ArrowUpRight size={13} />
                          </Link>
                        ) : (
                          <button
                            className="ws-button"
                            onClick={() =>
                              setReview({ messageId: message.id, action })
                            }
                          >
                            {t("Review & save")}
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="ws-message-tools">
                      <button
                        type="button"
                        onClick={() => copyMessage(message.id, message.content)}
                        aria-label={t("Copy message")}
                      >
                        <Copy size={13} />
                        {copiedId === message.id ? t("Copied") : t("Copy")}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
            {optimistic &&
              !query.data?.messages.some(
                (message) =>
                  message.role === "user" &&
                  !optimistic.priorIds.includes(message.id),
              ) && (
                <article className="ws-message ws-message-user ws-message-optimistic">
                  <div className="ws-message-label">
                    <span className="ws-message-avatar ws-message-avatar-user">
                      {t("You").slice(0, 1)}
                    </span>
                    <strong>{t("You")}</strong>
                    <small>{t("Sending…")}</small>
                  </div>
                  <div className="ws-message-prose">
                    <AgentText content={optimistic.text} />
                  </div>
                </article>
              )}
            {optimistic && conversationId && !query.data && (
              <div className="ws-assistant-working" role="status">
                <span className="ws-message-avatar ws-message-avatar-assistant">
                  h
                </span>
                <div>
                  <strong>{t("Hirelix is working")}</strong>
                  <span>
                    <Loader2 size={13} className="animate-spin" />
                    {t("Opening your conversation…")}
                  </span>
                </div>
              </div>
            )}
            {(pending || sending) && (
              <div className="ws-assistant-working" role="status">
                <span className="ws-message-avatar ws-message-avatar-assistant">
                  h
                </span>
                <div>
                  <strong>{t("Hirelix is working")}</strong>
                  <span>
                    <Loader2 size={13} className="animate-spin" />
                    {sending
                      ? t("Saving your message…")
                      : t(job?.progress || "Working on your request…")}
                  </span>
                  <small>{t("You can leave this page and return.")}</small>
                </div>
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
          {showJump && (
            <button
              type="button"
              className="ws-jump-latest"
              onClick={jumpToLatest}
            >
              <ChevronsDown size={15} />
              {t("Jump to latest")}
            </button>
          )}
          <form
            className={`ws-composer ${dragging ? "is-dragging" : ""}`}
            onSubmit={send}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault();
                setDragging(true);
              }
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!sending) chooseFile(e.dataTransfer.files[0]);
            }}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                if (!sending) chooseFile(e.clipboardData.files[0]);
              }
            }}
          >
            {dragging && (
              <div className="ws-composer-drop-target">
                <Paperclip size={18} />
                {t("Drop a file to ask your assistant")}
              </div>
            )}
            <input
              ref={fileInput}
              className="sr-only"
              tabIndex={-1}
              aria-label={t("Attach a file")}
              type="file"
              accept=".csv,.pdf,.docx,.txt,.md"
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
                    {t("· Attached file")}
                  </small>
                </span>
                <button
                  className="ws-icon"
                  type="button"
                  aria-label={t("Remove attachment")}
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
                  {t("Working on")}{" "}
                  <select
                    aria-label={t("Conversation role")}
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                  >
                    <option value="">{t("My workspace")}</option>
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
            <textarea
              ref={composer}
              aria-label={t("Message your assistant")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("Ask, paste a JD, or share a conversation note…")}
              rows={1}
              maxLength={50000}
              disabled={sending}
              onKeyDown={onComposerKeyDown}
            />
            <div className="ws-composer-footer">
              <button
                type="button"
                className="ws-attach-button"
                disabled={sending}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={14} />
                {t("Attach a file")}
              </button>
              <span>
                {pending
                  ? t(
                      "Your next message can be drafted while this reply finishes",
                    )
                  : t("Enter to send · Shift + Enter for a new line")}
              </span>
              <button
                type="submit"
                className="ws-button ws-button-primary"
                aria-label={t("Send message")}
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
        {contextOpen && (
          <aside
            className="ws-assistant-context"
            aria-label={t("Current work")}
          >
            <div className="ws-context-heading">
              <strong>{t("Workspace context")}</strong>
              <button
                type="button"
                className="ws-icon"
                aria-label={t("Close workspace context")}
                onClick={() => setContextOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <section>
              <h2>{t("Working on")}</h2>
              {activeRole ? (
                <>
                  <Link
                    className="ws-context-role"
                    href={`/app/roles/${activeRole.id}`}
                  >
                    <span>{activeRole.client_name}</span>
                    <strong>{activeRole.title}</strong>
                    <small>
                      {t(activeRole.status)} <ArrowUpRight size={12} />
                    </small>
                  </Link>
                  {roleDetail.data && (
                    <p>
                      {roleDetail.data.people.length} {t("candidates ·")}{" "}
                      {roleDetail.data.records.length} {t("records")}
                    </p>
                  )}
                  <Link
                    className="ws-detail-link"
                    href={`/app/submissions/new?role=${activeRole.id}`}
                  >
                    {t("Prepare a submission")} <ArrowUpRight size={12} />
                  </Link>
                </>
              ) : (
                <>
                  <p>
                    {t(
                      "Select a role when your conversation relates to a client assignment.",
                    )}
                  </p>
                  <button
                    className="ws-text-button"
                    onClick={() => setAddingRole(true)}
                  >
                    <Plus size={13} />
                    {t("Add a role")}
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
                {t("Client roles")}{" "}
                <Link href="/app/roles">{t("View all")}</Link>
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
                <p>{t("Add your first client role from its JD.")}</p>
              )}
            </section>
            {roleDetail.data?.deliverables.filter((d) => d.status === "draft")
              .length ? (
              <section>
                <h2>{t("Drafts to finish")}</h2>
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
          </aside>
        )}
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
          ? t("Review new role")
          : action.kind === "update_role_brief"
            ? t("Review updated requirements")
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
            <Field label={t("Record type")}>
              <select
                value={String(fields.kind)}
                onChange={(e) => set("kind", e.target.value)}
              >
                {["note", "call", "email", "feedback"].map((kind) => (
                  <option key={kind}>{kind}</option>
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
            <Field
              label={t("When it happened")}
              hint={t(
                "Leave empty if the date was not recorded. Saving time is kept separately.",
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
          </>
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
                  : t("Save record")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

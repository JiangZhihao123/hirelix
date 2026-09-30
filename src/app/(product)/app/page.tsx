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
  Check,
  Loader2,
  Pencil,
  Copy,
  ChevronsDown,
  BriefcaseBusiness,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
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
function assistantDraftKey(
  conversationId: string | null,
  roleId: string | null,
  personId: string | null,
  initialPrompt = "",
) {
  if (conversationId) return `hirelix:assistant:draft:${conversationId}`;
  if (!roleId && !personId && !initialPrompt)
    return "hirelix:assistant:draft:new";
  return `hirelix:assistant:draft:new:${roleId || "-"}:${personId || "-"}${initialPrompt ? `:prompt:${encodeURIComponent(initialPrompt)}` : ""}`;
}
export default function AssistantHome() {
  const params = useSearchParams();
  const conversationId = params.get("conversation");
  const roleId = params.get("role"),
    personId = params.get("person");
  const initialPrompt = params.get("prompt")?.slice(0, 500) || "";
  const [handoff, setHandoff] = useState<{
    conversationId: string;
    text: string;
  } | null>(null);
  return (
    <AssistantWorkspace
      key={assistantDraftKey(conversationId, roleId, personId, initialPrompt)}
      conversationId={conversationId}
      initialRoleId={roleId}
      personId={personId}
      initialPrompt={initialPrompt}
      handoffText={
        handoff?.conversationId === conversationId ? handoff.text : null
      }
      onHandoffSettled={() => setHandoff(null)}
      onOpen={(id, text) => {
        if (text) setHandoff({ conversationId: id, text });
        // This page loads conversation data on the client. Keep this query-only
        // change in the current route; Next synchronizes useSearchParams here.
        window.history.pushState(null, "", `/app?conversation=${id}`);
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
  const router = useRouter();
  const { locale } = useLanguage();
  const roles = useQuery<{ roles: Role[] }>("/roles");
  const query = useQuery<Detail>(
    conversationId ? `/conversations/${conversationId}` : null,
  );
  const [roleId, setRoleId] = useState(initialRoleId || ""),
    [linkedPersonId, setLinkedPersonId] = useState(personId || ""),
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
  const [contextOpen, setContextOpen] = useState(false);
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
  const scrollSize = useRef({ height: 0, viewport: 0 });
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
  useEffect(() => { window.dispatchEvent(new Event("hirelix:billing-changed")); }, [job?.id, job?.status]);
  const pending = !!job && ["queued", "running"].includes(job.status);
  const activeRoleId = query.data?.conversation.role_id || roleId;
  const activeRole = roles.data?.roles.find((r) => r.id === activeRoleId);
  const activePersonId = query.data?.conversation.person_id || linkedPersonId;
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
  const draftStorageKey = assistantDraftKey(
    conversationId,
    initialRoleId,
    personId,
    initialPrompt,
  );
  const draftRoleKey = `${draftStorageKey}:role`;
  useEffect(() => {
    const storedDraft = localStorage.getItem(draftStorageKey) || "";
    setDraft(storedDraft || initialPrompt);
    setRoleId(
      initialRoleId ||
        (storedDraft ? localStorage.getItem(draftRoleKey) || "" : ""),
    );
    setLinkedPersonId(personId || "");
    setDraftReady(true);
  }, [draftStorageKey, draftRoleKey, initialPrompt, initialRoleId, personId]);
  useEffect(() => {
    if (!draftReady) return;
    if (draft) {
      localStorage.setItem(draftStorageKey, draft);
      if (!conversationId && roleId && roleId !== initialRoleId)
        localStorage.setItem(draftRoleKey, roleId);
      else localStorage.removeItem(draftRoleKey);
    } else {
      localStorage.removeItem(draftStorageKey);
      localStorage.removeItem(draftRoleKey);
    }
  }, [draft, draftReady, draftStorageKey, draftRoleKey, conversationId, roleId, initialRoleId]);
  useEffect(() => {
    const field = composer.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 220)}px`;
  }, [draft]);
  useEffect(() => {
    if (!contextOpen) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setContextOpen(false);
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
  }, [contextOpen]);
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
  useEffect(() => {
    const viewport = scroll.current;
    if (!viewport) return;
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (!stickToBottom.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        viewport.scrollTop = viewport.scrollHeight;
      });
    });
    observer.observe(viewport, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const resizeObserver = new ResizeObserver(() => {
      if (!stickToBottom.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        viewport.scrollTop = viewport.scrollHeight;
      });
    });
    resizeObserver.observe(viewport);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [conversationId]);
  function jumpToLatest() {
    stickToBottom.current = true;
    scroll.current?.scrollTo({
      top: scroll.current.scrollHeight,
      behavior: "instant",
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
      window.dispatchEvent(new Event("hirelix:conversations-changed"));
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
        if (!conversationId && linkedPersonId)
          form.append("person_id", linkedPersonId);
        const uploaded = await api<{ conversation_id: string }>("/conversations", {
          method: "POST",
          body: form,
        });
        setAttachment(null);
        setDraft("");
        localStorage.removeItem(draftStorageKey);
        localStorage.removeItem(draftRoleKey);
        setAttachmentKey(crypto.randomUUID());
        if (fileInput.current) fileInput.current.value = "";
        const target = uploaded.conversation_id;
        window.dispatchEvent(new Event("hirelix:conversations-changed"));
        if (!conversationId) onOpen(target);
        else query.refresh();
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
          person_id: conversationId ? null : linkedPersonId || null,
        }),
      });
      setDraft("");
      localStorage.removeItem(draftStorageKey);
      localStorage.removeItem(draftRoleKey);
      request.current = null;
      window.dispatchEvent(new Event("hirelix:conversations-changed"));
      if (!conversationId) onOpen(result.conversation_id, text);
      else query.refresh();
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
  function removeNewConversationContext(kind: "role" | "person") {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(kind)) return;
    params.delete(kind);
    const nextKey = assistantDraftKey(
      null,
      params.get("role"),
      params.get("person"),
      params.get("prompt") || "",
    );
    const existingDraft = localStorage.getItem(nextKey);
    if (
      draft &&
      existingDraft &&
      existingDraft !== draft &&
      !window.confirm(t("This conversation already has an unsent draft. Replace it?"))
    )
      return;
    if (kind === "role") setRoleId("");
    else setLinkedPersonId("");
    if (draft) {
      localStorage.setItem(nextKey, draft);
      if (kind !== "role" && roleId && roleId !== params.get("role"))
        localStorage.setItem(`${nextKey}:role`, roleId);
      else localStorage.removeItem(`${nextKey}:role`);
    }
    const remaining = params.toString();
    router.replace(`/app${remaining ? `?${remaining}` : ""}`, { scroll: false });
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
        <section className="ws-conversation" aria-label={t("Conversation")}>
          <header className="ws-conversation-header">
            <div className="ws-chat-title-row">
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
                  <h1 title={query.data?.conversation.title}>
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
              {(conversationId || activeRoleId || activePersonId) && (
                <button
                  type="button"
                  className={`ws-chat-context-trigger ${contextOpen ? "is-active" : ""}`}
                  aria-expanded={contextOpen}
                  onClick={() => setContextOpen(!contextOpen)}
                >
                  {t("Current work")}
                </button>
              )}
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
            className={`ws-conversation-scroll ${!conversationId ? "ws-conversation-scroll-empty" : ""}`}
            onScroll={(event) => {
              const el = event.currentTarget;
              const layoutChanged =
                scrollSize.current.height !== el.scrollHeight ||
                scrollSize.current.viewport !== el.clientHeight;
              scrollSize.current = {
                height: el.scrollHeight,
                viewport: el.clientHeight,
              };
              if (layoutChanged && stickToBottom.current) {
                el.scrollTop = el.scrollHeight;
                return;
              }
              const nearBottom =
                el.scrollHeight - el.scrollTop - el.clientHeight < 100;
              stickToBottom.current = nearBottom;
              setShowJump(!nearBottom);
            }}
          >
            {conversationId && !query.data ? (
              query.loading && !optimistic ? (
                <Loading>{t("Opening your conversation…")}</Loading>
              ) : null
            ) : !count && !optimistic ? (
              <div className="ws-assistant-start">
                <div className="ws-assistant-mark">
                  <BrandMark small />
                </div>
                <h2>{t("What would you like to work on?")}</h2>
                <p>{t("Ask a question, paste a JD, or add a file. I'll follow your lead.")}</p>
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
                        {message.role === "user" ? t("You").slice(0, 1) : <BrandMark small />}
                      </span>
                      <strong>
                        {message.role === "user" ? t("You") : t("Hirelix")}
                      </strong>
                      <time>{date(message.created_at, true)}</time>
                    </div>
                    <div className="ws-message-prose">
                      {message.role === "assistant" && metadata.actions?.some(
                        (action) => action.status === "pending" && !action.href,
                      ) && (
                        <p className="ws-proposal-status">
                          {t("The proposed changes below are not saved yet. Review them before they become part of your workspace.")}
                        </p>
                      )}
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
                                    : action.kind === "update_sharing_permission"
                                      ? t("Review the evidence and sharing permission before saving")
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
                  <BrandMark small />
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
                  <BrandMark small />
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
            {!conversationId && (roleId || linkedPersonId) && (
              <div className="ws-composer-context-tags">
                {roleId && (
                  <span className="ws-composer-context-tag">
                    <BriefcaseBusiness size={13} />
                    <span
                      title={
                        activeRole
                          ? `${activeRole.client_name} · ${activeRole.title}`
                          : t("Role")
                      }
                    >
                      {activeRole
                        ? `${activeRole.client_name} · ${activeRole.title}`
                        : t("Role")}
                    </span>
                    <button
                      type="button"
                      aria-label={t("Remove role from conversation")}
                      onClick={() => removeNewConversationContext("role")}
                    >
                      <X size={13} />
                    </button>
                  </span>
                )}
                {linkedPersonId && (
                  <span className="ws-composer-context-tag">
                    <span title={person.data?.person.name || t("Candidate")}>
                      {person.data?.person.name || t("Candidate")}
                    </span>
                    <button
                      type="button"
                      aria-label={t("Remove candidate from conversation")}
                      onClick={() => removeNewConversationContext("person")}
                    >
                      <X size={13} />
                    </button>
                  </span>
                )}
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
              <strong>{t("Current work")}</strong>
              <button
                type="button"
                className="ws-icon"
                aria-label={t("Close current work panel")}
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
            window.dispatchEvent(new Event("hirelix:conversations-changed"));
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

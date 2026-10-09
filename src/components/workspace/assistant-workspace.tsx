"use client";

import { TurnActivity } from "./turn-activity";
import { copyConversationMessage } from "./message-copy";
import { assistantDraftKey } from "./conversation-draft";
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
  Paperclip,
  Check,
  Loader2,
  Pencil,
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
} from "@/components/workspace/client";
import { ConversationMessage } from "@/components/workspace/conversation-message";
import { RoleForm } from "@/components/workspace/forms";
import { AssistantWork } from "@/components/workspace/assistant-work";
import { ActionReview } from "@/components/workspace/action-review";
import { ContextPanel } from "@/components/workspace/context-panel";
import { PersonalMemories } from "@/components/workspace/memories";
import type {
  Deliverable,
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

import { attachmentError, MAX_CONVERSATION_FILES } from "@/lib/workspace/attachments";

type PendingFile = { id: string; file: File; fileId?: string; status: "ready" | "uploading" | "uploaded" | "error"; error?: string };
type Detail = {
  conversation: Conversation;
  messages: Message[];
  job: Job | null;
  work: Job[];
  document: Deliverable | null;
};
export function AssistantWorkspace({
  conversationId,
  documentId,
  initialRoleId,
  personId,
  initialPrompt,
  handoffText,
  onHandoffSettled,
  onOpen,
}: {
  conversationId: string | null;
  documentId: string | null;
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
  const [attachments, setAttachments] = useState<PendingFile[]>([]);
  const dragDepth = useRef(0);
  const [contextOpen, setContextOpen] = useState(false);
  const [source, setSource] = useState<{title: string; href: string} | null>(null);
  const memoryRequested = useSearchParams().has("memories");
  const [memoriesOpen, setMemoriesOpen] = useState(false);
  useEffect(() => { if (memoryRequested) setMemoriesOpen(true); }, [memoryRequested]);
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
  function chooseFiles(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files);
    if (attachments.length + incoming.length > MAX_CONVERSATION_FILES) {
      setError(t("Add up to 20 files per message."));
      return;
    }
    setAttachments((current) => [...current, ...incoming.map((file): PendingFile => {
      const error = attachmentError(file.name, file.size);
      return { id: crypto.randomUUID(), file, status: error ? "error" : "ready", ...(error ? { error } : {}) };
    })]);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
    composer.current?.focus();
  }
  async function uploadFile(item: PendingFile): Promise<string | null> {
    if (item.fileId) return item.fileId;
    const validation = attachmentError(item.file.name, item.file.size);
    if (validation) return null;
    setAttachments((items) => items.map((entry) => entry.id === item.id ? { ...entry, status: "uploading", error: undefined } : entry));
    try {
      const body = new FormData();
      body.append("file", item.file);
      const result = await api<{ file: { file_id: string } }>("/files", { method: "POST", body });
      setAttachments((items) => items.map((entry) => entry.id === item.id ? { ...entry, fileId: result.file.file_id, status: "uploaded" } : entry));
      setError("");
      return result.file.file_id;
    } catch (cause) {
      setAttachments((items) => items.map((entry) => entry.id === item.id ? { ...entry, status: "error", error: cause instanceof TypeError ? "Upload failed. Check your connection and retry." : cause instanceof Error ? cause.message : "Could not upload file" } : entry));
      return null;
    }
  }
  const [revisionTarget, setRevisionTarget] = useState<Deliverable | null>(null);
  const request = useRef<{ text: string; key: string } | null>(null),
    scroll = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  const job = query.data?.job;
  useEffect(() => { window.dispatchEvent(new Event("hirelix:billing-changed")); if (job?.status === "done") window.dispatchEvent(new Event("hirelix:conversations-changed")); }, [job?.id, job?.status]);
  const pending = !!job && ["queued", "running"].includes(job.status);
  const hasAgreement = query.data?.messages.some(message => ((message.metadata as AssistantMeta).schedules?.length || (message.metadata as AssistantMeta).reminders?.length || (message.metadata as AssistantMeta).question?.status === "waiting"));
  const delegatedPending = query.data?.work?.some(work => ["queued", "running"].includes(work.status));
  const refreshConversation = query.refresh;
  useEffect(() => {
    if (!hasAgreement && !delegatedPending) return;
    const timer = setInterval(refreshConversation, delegatedPending ? 2500 : 15000);
    return () => clearInterval(timer);
  }, [hasAgreement, delegatedPending, refreshConversation]);
  const linkedDocument = useQuery<{ deliverable: Deliverable }>(documentId && !conversationId ? `/deliverables/${documentId}` : null);
  const currentDocument = query.data?.document || linkedDocument.data?.deliverable;
  const activeRoleId = currentDocument?.role_id || query.data?.conversation.role_id || roleId;
  const activeRole = roles.data?.roles.find((r) => r.id === activeRoleId);
  const activePersonId = query.data?.conversation.person_id || linkedPersonId;
  const person = useQuery<{ person: Person }>(
    activePersonId ? `/people/${activePersonId}` : null,
  );
  const draftStorageKey = assistantDraftKey(
    conversationId,
    initialRoleId,
    personId,
    initialPrompt,
    documentId,
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
    if (!viewport || !conversationId) return;
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
  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !attachments.length) || sending || pending || attachments.some((item) => item.status === "uploading")) return;
    setSending(true);
    setError("");
    stickToBottom.current = true;
    setShowJump(false);
    if (!attachments.length)
      setOptimistic({
        text,
        priorIds: query.data?.messages.map((m) => m.id) || [],
      });
    try {
      const fileIds: string[] = [];
      for (const item of attachments) {
        const fileId = await uploadFile(item);
        if (fileId) fileIds.push(fileId);
      }
      if (fileIds.length !== attachments.length) {
        setError(t("Some files need attention. Retry or remove them, then send. Uploaded files are kept."));
        return;
      }
      const signature = JSON.stringify({ text, fileIds, revisionTarget: revisionTarget?.id });
      if (request.current?.text !== signature)
        request.current = { text: signature, key: crypto.randomUUID() };
      const result = await api<{ conversation_id: string }>("/conversations", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          file_ids: fileIds,
          locale,
          work_document_id: revisionTarget?.id || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          request_key: request.current.key,
          conversation_id: conversationId,
          role_id: conversationId ? null : roleId || null,
          person_id: conversationId ? null : linkedPersonId || null,
          document_id: conversationId ? null : documentId,
        }),
      });
      setDraft("");
      setRevisionTarget(null);
      setAttachments([]);
      localStorage.removeItem(draftStorageKey);
      localStorage.removeItem(draftRoleKey);
      request.current = null;
      window.dispatchEvent(new Event("hirelix:conversations-changed"));
      if (!conversationId) onOpen(result.conversation_id, attachments.length ? undefined : text);
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
  async function stop() {
    if (!job) return;
    try { await api(`/jobs/${job.id}`, {method: "DELETE"}); query.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not stop"); }
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
      params.get("document"),
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
        <section className={`ws-conversation ${dragging ? "is-dragging" : ""}`} aria-label={t("Conversation")}
          onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); dragDepth.current++; setDragging(true); } }}
          onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
          onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); if (!sending) chooseFiles(event.dataTransfer.files); }}
        >
          {dragging && <div className="ws-conversation-drop-target"><Paperclip size={28} /><strong>{t("Drop files here")}</strong><span>{t("Share the material. Tell me what you want done.")}</span></div>}
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
                    {query.data?.conversation.title || t("AI assistant")}
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
              {(
                <button
                  type="button"
                  className={`ws-chat-context-trigger ${contextOpen ? "is-active" : ""}`}
                  aria-expanded={contextOpen}
                  onClick={() => setContextOpen(!contextOpen)}
                >
                  {t("Library")}
                </button>
              )}
            </div>
          </header>
          {currentDocument && <Link className="ws-linked-document" href={currentDocument.kind === "search_update" ? `/app/roles/${currentDocument.role_id}/updates/${currentDocument.id}` : `/app/submissions/${currentDocument.id}`}><Paperclip size={14} /><span>{currentDocument.title}</span><small>{t("Saved document")}</small><ArrowUpRight size={14} /></Link>}
          <ErrorNotice
            error={error || query.error || roles.error || linkedDocument.error}
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
              if (!conversationId) return;
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
                <h2>{t("What would you like me to take care of?")}</h2>
                <p>{currentDocument ? t("This saved document is ready to discuss or revise. Tell me what you want to change.") : t("Your personal AI assistant for headhunting. Share the goal and the context; I’ll carry the work forward.")}</p>
                <button className="ws-link ws-home-memory" onClick={() => setMemoriesOpen(true)}>{t("What I remember")} <ArrowUpRight size={13} /></button>
              </div>
            ) : (
              query.data?.messages.map((message, index) => <ConversationMessage key={message.id} message={message}
                importRefresh={job?.status === "done" ? job.id : undefined}
                laterScheduleIds={query.data!.messages.slice(index + 1).flatMap(item => (item.metadata as AssistantMeta).schedules?.map(schedule => schedule.id) || [])}
                onReady={query.refresh} onRevise={document => { setRevisionTarget(document); setDraft(`${document.title}: ${t("Please revise the document: ")}`); composer.current?.focus(); }}
                onMemories={() => setMemoriesOpen(true)} onSource={source => { setContextOpen(false); setSource(source); }}
                onReview={(messageId, action) => setReview({messageId, action})} onCopy={(id, content) => void copyConversationMessage(id, content, setCopiedId, setError)} copiedId={copiedId}
              />)
            )}
            {query.data?.work?.filter(work => !query.data?.messages.some(message => (message.metadata as AssistantMeta).work?.some(receipt => receipt.job_id === work.id))).map(work => <AssistantWork key={work.id} receipt={{ job_id: work.id, kind: "search_update", title: t("Your agreed recurring update") }} onReady={query.refresh} onRevise={document => { setRevisionTarget(document); setDraft(`${document.title}：${t("Please revise the draft: ")}`); composer.current?.focus(); }} />)}
            {optimistic &&
              !query.data?.messages.some(
                (message) =>
                  message.role === "user" &&
                  !optimistic.priorIds.includes(message.id),
              ) && (
                <article className="ws-message ws-message-user ws-message-optimistic" aria-label={t("Your message")}>
                  <div className="ws-message-prose">
                    <AgentText content={optimistic.text} />
                  </div>
                </article>
              )}
            {(pending || sending || (optimistic && conversationId && !query.data)) && (
              <TurnActivity key={job?.id || "sending"} job={pending ? job : null} onComplete={query.refresh} onStop={() => void stop()} />
            )}
            {job?.status === "cancelled" && <p role="status" className="ws-muted">{t("Stopped. You can send a new instruction.")}</p>}
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
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                if (!sending) chooseFiles(e.clipboardData.files);
              }
            }}
          >
            {revisionTarget && <div className="ws-composer-context-tags"><span className="ws-composer-context-tag"><Pencil size={12} />{t("Revising")}: {revisionTarget.title}<button type="button" className="ws-icon" onClick={() => setRevisionTarget(null)} aria-label={t("Clear document context")}><X size={12} /></button></span></div>}
            <input
              ref={fileInput}
              className="sr-only"
              tabIndex={-1}
              aria-label={t("Add files")}
              type="file"
              multiple
              disabled={sending}
              accept=".csv,.pdf,.docx,.txt,.md"
              onChange={(e) => chooseFiles(e.target.files)}
            />
            {attachments.length > 0 && (
              <div className="ws-composer-files" aria-live="polite">
                {attachments.map((item) => (
                  <div key={item.id} className={`ws-composer-attachment ${item.status === "error" ? "has-error" : ""}`}>
                    {item.status === "uploading" ? <Loader2 size={14} className="animate-spin" /> : item.status === "uploaded" ? <Check size={14} /> : <Paperclip size={14} />}
                    <span title={item.file.name}>{item.file.name}<small>{item.error ? t(item.error) : item.status === "uploading" ? t("Uploading…") : item.status === "uploaded" ? t("Ready to send") : `${Math.ceil(item.file.size / 1024)} KB`}</small></span>
                    {item.status === "error" && !attachmentError(item.file.name, item.file.size) && (
                      <button type="button" className="ws-link" disabled={sending} onClick={() => void uploadFile(item)}>{t("Retry")}</button>
                    )}
                    <button className="ws-icon" type="button" aria-label={`${t("Remove attachment")}: ${item.file.name}`} disabled={sending || item.status === "uploading"} onClick={() => setAttachments((items) => items.filter((entry) => entry.id !== item.id))}><X size={14} /></button>
                  </div>
                ))}
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
                    {!documentId && <button
                      type="button"
                      aria-label={t("Remove role from conversation")}
                      onClick={() => removeNewConversationContext("role")}
                    >
                      <X size={13} />
                    </button>}
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
              aria-label={t("Message your AI assistant")}
              value={sending ? "" : draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("Ask, paste a JD, or share a conversation note…")}
              rows={1}
              maxLength={50000}
              disabled={sending || !draftReady}
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
                {t("Add files")}
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
                  (!draft.trim() && !attachments.length) ||
                  sending ||
                  attachments.some((item) => item.status === "uploading") ||
                  pending ||
                  job?.status === "error"
                }
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </form>
        </section>
        {source && <ContextPanel source={source} onClose={() => setSource(null)} />}
        {contextOpen && <aside className="ws-assistant-context" aria-label={t("Library")}>
          <div className="ws-context-heading"><strong>{t("Library")}</strong><button className="ws-icon" onClick={() => setContextOpen(false)} aria-label={t("Close")}><X size={16} /></button></div>
          <button className="ws-button" onClick={() => setAddingRole(true)}>{t("Add role")}</button>
          {roles.data?.roles.map(role => <button className="ws-detail-link" key={role.id} onClick={() => { setRoleId(role.id); setSource({title: role.title, href: `/app/roles/${role.id}`}); setContextOpen(false); }}>{role.client_name} · {role.title}</button>)}
          <button className="ws-link" onClick={() => setMemoriesOpen(true)}>{t("What I remember")}</button>
        </aside>}
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
      {memoriesOpen && <PersonalMemories onClose={() => setMemoriesOpen(false)} />}
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

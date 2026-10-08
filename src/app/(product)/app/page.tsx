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
import { AssistantWork, AssistantAgreement } from "@/components/workspace/assistant-work";
import { RecentWork } from "@/components/workspace/recent-work";
import { ConversationRevision } from "@/components/workspace/assistant-work";
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

import { attachmentError, MAX_CONVERSATION_FILES, messageAttachments, messageImportJobs } from "@/lib/workspace/attachments";

type PendingFile = { id: string; file: File; fileId?: string; status: "ready" | "uploading" | "uploaded" | "error"; error?: string };
type Detail = {
  conversation: Conversation;
  messages: Message[];
  job: Job | null;
  work: Job[];
  document: Deliverable | null;
};
function assistantDraftKey(
  conversationId: string | null,
  roleId: string | null,
  personId: string | null,
  initialPrompt = "",
  documentId: string | null = null,
) {
  if (conversationId) return `hirelix:assistant:draft:${conversationId}`;
  if (!roleId && !personId && !initialPrompt && !documentId)
    return "hirelix:assistant:draft:new";
  return `hirelix:assistant:draft:new:${roleId || "-"}:${personId || "-"}:${documentId || "-"}${initialPrompt ? `:prompt:${encodeURIComponent(initialPrompt)}` : ""}`;
}
export default function AssistantHome() {
  const params = useSearchParams();
  const conversationId = params.get("conversation");
  const roleId = params.get("role"),
    personId = params.get("person");
  const documentId = params.get("document");
  const initialPrompt = params.get("prompt")?.slice(0, 500) || "";
  const [handoff, setHandoff] = useState<{
    conversationId: string;
    text: string;
  } | null>(null);
  return (
    <AssistantWorkspace
      key={assistantDraftKey(conversationId, roleId, personId, initialPrompt, documentId)}
      conversationId={conversationId}
      documentId={documentId}
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
  const hasAgreement = query.data?.messages.some(message => (message.metadata as AssistantMeta).schedules?.length);
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
              {conversationId && <Link className="ws-button ws-chat-new" href="/app"><Plus size={14} /><span>{t("New conversation")}</span></Link>}
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
                  {t("Current work")}
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
                {!activeRoleId && !activePersonId && !documentId && <RecentWork />}
                <button className="ws-link ws-home-memory" onClick={() => setMemoriesOpen(true)}>{t("What I remember")} <ArrowUpRight size={13} /></button>
              </div>
            ) : (
              query.data?.messages.map((message) => {
                const metadata = message.metadata as AssistantMeta;
                return (
                  <article
                    className={`ws-message ws-message-${message.role}`}
                    aria-label={message.role === "user" ? t("Your message") : t("Hirelix")}
                    key={message.id}
                  >
                    {message.role === "assistant" && (
                      <div className="ws-message-label">
                        <span className="ws-message-avatar ws-message-avatar-assistant">
                          <BrandMark small />
                        </span>
                        <strong>{t("Hirelix")}</strong>
                        <time dateTime={message.created_at}>{date(message.created_at, true)}</time>
                      </div>
                    )}
                    <div className="ws-message-prose">
                      <AgentText content={message.content} />
                      {messageAttachments(message.metadata).map((file) => (
                        <a key={file.file_id} className="ws-chat-attachment" href={`/api/workspace/files/${file.file_id}`}>
                          <Paperclip size={14} />{file.name}
                        </a>
                      ))}
                    </div>
                    {messageImportJobs(message.metadata).map((jobId) => (
                      <ConversationImport key={jobId} jobId={jobId} embedded={message.role === "assistant"} refreshToken={job?.status === "done" ? job.id : undefined} />
                    ))}
                    {metadata.work?.map(receipt => <AssistantWork key={receipt.job_id} receipt={receipt} onReady={query.refresh} onRevise={document => { setRevisionTarget(document); setDraft(`${document.title}：${t("Please revise the draft: ")}`); composer.current?.focus(); }} />)}
                    {metadata.schedules?.filter(receipt => !query.data?.messages.slice(query.data.messages.indexOf(message) + 1).some(later => (later.metadata as AssistantMeta).schedules?.some(item => item.id === receipt.id))).map(receipt => <AssistantAgreement key={receipt.id} receipt={receipt} />)}
                    {metadata.revision && <ConversationRevision revision={metadata.revision} onApplied={query.refresh} />}
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
                    {!!metadata.memories?.length && <div className="ws-memory-receipts">
                      {metadata.memories.map(memory => <button key={memory.id} type="button" onClick={() => setMemoriesOpen(true)}>
                        <Check size={13} />{t(memory.operation === "forget" ? "Forgotten" : memory.operation === "update" ? "Agreement updated" : "Remembered")} · {memory.title}
                      </button>)}
                    </div>}
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
                              ? t("Open saved item")
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
                      {message.role === "user" && <time dateTime={message.created_at}>{date(message.created_at, true)}</time>}
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
                  <div className="ws-message-tools">
                    <small className="ws-message-status" role="status">{t("Sending…")}</small>
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
                  <small>{t(sending ? "Keep this page open until your files and message are sent." : "You can leave this page and return.")}</small>
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
              value={draft}
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
              <h2>{t("About our work")}</h2>
              <button type="button" className="ws-text-button" onClick={() => setMemoriesOpen(true)}>{t("What I remember")}</button>
              <p>{t("Your working preferences carry across conversations.")}</p>
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

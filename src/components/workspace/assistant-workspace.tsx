"use client";

import { viewedSourceFromHref } from "@/lib/workspace/source-context";
import { MessageCandidateReferences } from "./message-candidate-references";
import { ComposerReference } from "./composer-reference";
import { MessageRoleReference, type RoleReference } from "./message-role-reference";
import { useCandidateMentions } from "./candidate-mentions";
import { conversationTurnView } from "./conversation-turn-view";
import { useTurnStream } from "./use-turn-stream";
import { isTurnRunning } from "@/lib/workspace/turn-progress";
import { copyConversationMessage } from "./message-copy";
import { assistantDraftKey } from "./conversation-draft";
import { readAttachmentDraft, saveAttachmentDraft, type PendingFile } from "./attachment-draft";
import { useAuth } from "@/components/AuthProvider";
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
  Square,
  ArrowUpRight,
  Paperclip,
  Check,
  Loader2,
  Pencil,
  ChevronsDown,
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
import { ConversationQueue } from "./conversation-queue";
import { ConversationMessage } from "@/components/workspace/conversation-message";
import { MessageAttachment } from "./message-attachment";
import { AttachmentThumbnail } from "./attachment-thumbnail";
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

import { ATTACHMENT_ACCEPT, attachmentError, MAX_CONVERSATION_FILES } from "@/lib/workspace/attachments";

type Detail = {
  conversation: Conversation & { notifications_through: string };
  messages: Message[];
  job: Job | null;
  work: Job[];
  queue: Job[];
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
  const { user } = useAuth();
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
    [review, setReview] = useState<{
      messageId: string;
      action: AssistantAction;
    } | null>(null);
  const [attachments, setAttachments] = useState<PendingFile[]>([]);
  const [attachmentDraftLoaded, setAttachmentDraftLoaded] = useState<string | null>(null);
  const [attachmentDraftError, setAttachmentDraftError] = useState("");
  const persistedAttachments = useRef<PendingFile[] | null>(null);
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
    files?: PendingFile[];
    candidates?: Array<{id: string; name: string}>;
    role?: RoleReference;
  } | null>(handoffText ? { text: handoffText, priorIds: [] } : null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);
  const scrollSize = useRef({ height: 0, viewport: 0 });
  function chooseFiles(files: FileList | null) {
    if (!files || !attachmentsReady) return;
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
  const viewedSource = source ? viewedSourceFromHref(source.href) : null;
  const selectedContext = revisionTarget || (source && viewedSource ? { id: viewedSource.id, title: source.title } : null);
  const request = useRef<{ text: string; key: string } | null>(null),
    scroll = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  const stopRequested = useRef(false);
  const [stopping, setStopping] = useState(false);
  const [pendingReplyKey, setPendingReplyKey] = useState("pending-reply");
  const [submittedJob, setSubmittedJob] = useState<Job | null>(null);
  // Once the submitted message is read back, server queue order owns the view.
  // Polling must not resurrect the original queued snapshot between responses.
  const submittedVisible = submittedJob && query.data?.messages.some(message => message.id === submittedJob.payload.message_id);
  const seedJob = submittedJob && !submittedVisible ? submittedJob : query.data?.job;
  const stopped = query.data?.conversation.stopped === true;
  const queued = query.data?.queue || [];

  const {job, disconnected, unfreeze} = useTurnStream(seedJob, query.refresh);
  useEffect(() => { window.dispatchEvent(new Event("hirelix:billing-changed")); if (job?.id) window.dispatchEvent(new Event("hirelix:conversations-changed")); }, [job?.id, job?.status]);
  const pending = isTurnRunning(job);
  const displayedMessages = conversationTurnView({messages: query.data?.messages || [], job, sending: sending && !pending && !stopped, pendingKey: pendingReplyKey, conversationId, optimistic});
  const hasAgreement = query.data?.messages.some(message => ((message.metadata as AssistantMeta).schedules?.length || (message.metadata as AssistantMeta).reminders?.length || (message.metadata as AssistantMeta).question?.status === "waiting"));
  const delegatedPending = query.data?.work?.some(work => ["queued", "running"].includes(work.status));
  const refreshConversation = query.refresh;
  useEffect(() => {
    const onUpdate = (event: Event) => {
      if ((event as CustomEvent<{ conversationId: string }>).detail.conversationId === conversationId) refreshConversation();
    };
    window.addEventListener("hirelix:conversation-updated", onUpdate);
    return () => window.removeEventListener("hirelix:conversation-updated", onUpdate);
  }, [conversationId, refreshConversation]);
  useEffect(() => {
    if (!query.data || query.loading || query.error) return;
    // Only acknowledge notifications whose conversation content has reached the page.
    api("/notifications", { method: "POST", body: JSON.stringify({
      conversation_id: query.data.conversation.id,
      through: query.data.conversation.notifications_through,
    }) }).catch(() => {});
  }, [query.data, query.loading, query.error]);
  useEffect(() => {
    if (!hasAgreement && !delegatedPending && !queued.length && !stopped) return;
    const timer = setInterval(refreshConversation, (!stopped && (delegatedPending || queued.length)) ? 2500 : 15000);
    return () => clearInterval(timer);
  }, [hasAgreement, delegatedPending, queued.length, stopped, refreshConversation]);
  const linkedDocument = useQuery<{ deliverable: Deliverable }>(documentId && !conversationId ? `/deliverables/${documentId}` : null);
  const currentDocument = query.data?.document || linkedDocument.data?.deliverable;
  const activeRoleId = roleId || (!conversationId ? currentDocument?.role_id : null);
  const activeRole = roles.data?.roles.find((r) => r.id === activeRoleId);
  const activePersonId = linkedPersonId;
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
  const mentions = useCandidateMentions(draftStorageKey, composer, setDraft);
  const attachmentDraftKey = user ? `${user.id}:${draftStorageKey}` : null;
  const attachmentsReady = !!attachmentDraftKey && attachmentDraftLoaded === attachmentDraftKey;
  const requestStorageKey = `${attachmentDraftKey}:request`;
  const promotedDraftKey = useRef<string | null>(null);
  useEffect(() => {
    if (!attachmentDraftKey) return;
    if (draftStorageKey === promotedDraftKey.current) {
      setAttachmentDraftLoaded(attachmentDraftKey);
      return;
    }
    let active = true;
    readAttachmentDraft(attachmentDraftKey).then(files => {
      if (active) { persistedAttachments.current = files; setAttachments(files); setAttachmentDraftLoaded(attachmentDraftKey); }
    }).catch(() => {
      if (active) {
        const empty: PendingFile[] = [];
        persistedAttachments.current = empty;
        setAttachments(empty);
        setAttachmentDraftLoaded(attachmentDraftKey);
        setAttachmentDraftError("Could not restore attachment drafts on this browser. Choose your files again.");
      }
    });
    try { request.current = JSON.parse(localStorage.getItem(requestStorageKey) || "null"); }
    catch { request.current = null; }
    return () => { active = false; };
  }, [attachmentDraftKey, requestStorageKey, draftStorageKey]);
  useEffect(() => {
    if (!attachmentDraftKey || !attachmentsReady || persistedAttachments.current === attachments) return;
    persistedAttachments.current = attachments;
    let active = true;
    void saveAttachmentDraft(attachmentDraftKey, attachments).catch(() => {
      if (active) setAttachmentDraftError("Could not keep attachments on this browser. Keep this page open until you send them.");
    });
    return () => { active = false; };
  }, [attachmentDraftKey, attachmentsReady, attachments]);
  useEffect(() => {
    if (draftStorageKey === promotedDraftKey.current) return;
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
      if (roleId && roleId !== initialRoleId)
        localStorage.setItem(draftRoleKey, roleId);
      else localStorage.removeItem(draftRoleKey);
    } else {
      localStorage.removeItem(draftStorageKey);
      localStorage.removeItem(draftRoleKey);
    }
  }, [draft, draftReady, draftStorageKey, draftRoleKey, conversationId, roleId, initialRoleId]);
  useEffect(() => {
    if (!draftReady || sending) return;
    const input = composer.current;
    input?.focus({ preventScroll: true });
    if (input) input.setSelectionRange(input.value.length, input.value.length);
  }, [draftReady, sending, conversationId]);
  useEffect(() => {
    const focus = () => composer.current?.focus({ preventScroll: true });
    window.addEventListener("hirelix:focus-composer", focus);
    return () => window.removeEventListener("hirelix:focus-composer", focus);
  }, []);
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
  const sendInFlight = useRef(false);
  async function send(event?: FormEvent, reply?: string, delivery: "queue" | "immediate" = "queue") {
    event?.preventDefault();
    const quickReply = reply !== undefined;
    const text = (reply ?? draft).trim();
    const outgoingAttachments = quickReply ? [] : attachments;
    const outgoingRole = quickReply ? undefined : roles.data?.roles.find(role => role.id === (viewedSource?.kind === "role" ? viewedSource.id : activeRoleId));
    const outgoingCandidates = quickReply ? [] : [...new Map([...(linkedPersonId ? [{id: linkedPersonId, name: person.data?.person.name || t("Candidate")}] : []), ...mentions.references].map(candidate => [candidate.id, candidate])).values()];
    if (sendInFlight.current || sending || (quickReply && pending) || (!text && !outgoingAttachments.length)) return;
    if (!quickReply && (!attachmentsReady || outgoingAttachments.some(item => item.status === "uploading"))) return;
    if (outgoingAttachments.some(item => attachmentError(item.file.name, item.file.size))) return;
    sendInFlight.current = true;
    stopRequested.current = false;
    composer.current?.focus({ preventScroll: true });
    const sendingKey = crypto.randomUUID();
    setPendingReplyKey(sendingKey);
    setSending(true);
    setError("");
    stickToBottom.current = true;
    setShowJump(false);
    if (!pending && !stopped || delivery === "immediate") setOptimistic({text, files: outgoingAttachments, candidates: outgoingCandidates, role: outgoingRole, priorIds: query.data?.messages.map(m => m.id) || []});
    try {
      const fileIds: string[] = [];
      for (const item of outgoingAttachments) {
        if (stopRequested.current) break;
        const fileId = await uploadFile(item);
        if (fileId) fileIds.push(fileId);
      }
      if (stopRequested.current) {
        setOptimistic(null);
        return;
      }
      if (fileIds.length !== outgoingAttachments.length) {
        setOptimistic(null);
        setError(t("Some files need attention. Retry or remove them, then send. Uploaded files are kept."));
        return;
      }
      const payload = {
        message: text,
        delivery,
        file_ids: fileIds,
        candidate_ids: outgoingCandidates.map(person => person.id),
        locale,
        work_document_id: quickReply ? null : revisionTarget?.id || null,
        viewed_source: quickReply || revisionTarget ? null : viewedSource,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        conversation_id: conversationId,
        role_id: quickReply ? null : roleId || null,
        document_id: conversationId ? null : documentId,
      };
      const signature = JSON.stringify(payload);
      if (request.current?.text !== signature)
        request.current = { text: signature, key: sendingKey };
      setPendingReplyKey(request.current.key);
      localStorage.setItem(requestStorageKey, JSON.stringify(request.current));
      const result = await api<{ conversation_id: string; job: Job }>("/conversations", {
        method: "POST",
        body: JSON.stringify({ ...payload, request_key: request.current.key }),
      });
      if ((!pending && !stopped) || delivery === "immediate") setSubmittedJob(result.job);
      else setSubmittedJob(null);
      setOptimistic(null);
      if (!quickReply) {
        setDraft("");
        mentions.clear();
        setLinkedPersonId("");
        setRoleId("");
        setSource(null);
        setRevisionTarget(null);
        setAttachments([]);
        localStorage.removeItem(draftStorageKey);
        localStorage.removeItem(draftRoleKey);
      }
      request.current = null;
      localStorage.removeItem(requestStorageKey);
      if (!quickReply && attachmentDraftKey) {
        await saveAttachmentDraft(attachmentDraftKey, []).catch(() => {
          setAttachmentDraftError("Your message was sent, but its local attachment draft could not be cleared.");
        });
      }
      if (stopRequested.current) {
        try {
          await api(`/conversations/${result.conversation_id}/control`, {method:"POST",body:JSON.stringify({action:"stop"})});
          setSubmittedJob(null);
        } catch (cause) {
          unfreeze();
          setError(cause instanceof Error ? cause.message : "Could not stop");
        }
      }
      window.dispatchEvent(new Event("hirelix:conversations-changed"));
      if (!conversationId) {
        promotedDraftKey.current = assistantDraftKey(result.conversation_id, null, null);
        onOpen(result.conversation_id, text);
      }
      else query.refresh();
      composer.current?.focus();
    } catch (cause) {
      setOptimistic(null);
      unfreeze();
      setError(
        cause instanceof Error ? cause.message : "Could not save your message",
      );
    } finally {
      sendInFlight.current = false;
      setSending(false);
      setStopping(false);
      requestAnimationFrame(() => composer.current?.focus());
    }
  }
  async function control(action: string, jobId?: string, message?: string) {
    if (!conversationId || stopping) return;
    setStopping(true); setError("");
    try {
      await api(`/conversations/${conversationId}/control`, {method:"POST",body:JSON.stringify({action,job_id:jobId,message})});
      setSubmittedJob(null); unfreeze(); query.refresh();
      window.dispatchEvent(new Event("hirelix:conversations-changed"));
    } catch(cause) { setError(cause instanceof Error ? cause.message : "Could not update conversation"); throw cause; }
    finally {setStopping(false);composer.current?.focus({preventScroll:true});}
  }
  async function stop() {
    if(stopping)return;
    if(sending)stopRequested.current=true;
    if(conversationId) await control("stop").catch(()=>{});
    else if(sending)setStopping(true);
  }
  async function retry() {
    if (!job) return;
    try {
      if(stopped) await control("resume");
      else await api(`/jobs/${job.id}`, { method: "POST" });
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
    if (mentions.onKeyDown(event)) return;
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    if (!sending) event.currentTarget.form?.requestSubmit();
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
              {(
                <button
                  type="button"
                  className={`ws-chat-context-trigger ${contextOpen ? "is-active" : ""}`}
                  aria-expanded={contextOpen}
                  onClick={() => setContextOpen(!contextOpen)}
                >
                  {t("Choose role")}
                </button>
              )}
            </div>
          </header>
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
            {conversationId && !query.data && !optimistic ? (
              query.loading && !optimistic ? (
                <Loading>{t("Opening your conversation…")}</Loading>
              ) : null
            ) : !count && !optimistic && !displayedMessages.length ? (
              <div className="ws-assistant-start">
                <div className="ws-assistant-mark">
                  <BrandMark small />
                </div>
                <h2>{t("What would you like me to take care of?")}</h2>
                <p>{currentDocument ? t("This saved document is ready to discuss or revise. Tell me what you want to change.") : t("Your personal AI assistant for headhunting. Share the goal and the context; I’ll carry the work forward.")}</p>
                <button className="ws-link ws-home-memory" onClick={() => setMemoriesOpen(true)}>{t("What I remember")} <ArrowUpRight size={13} /></button>
              </div>
            ) : (
              displayedMessages.map(({key, message, activeJob, optimistic: isOptimistic}, index) => isOptimistic ? (
                <article key={key} className="ws-message ws-message-user ws-message-optimistic" aria-label={t("Your message")}>
                  <MessageRoleReference reference={optimistic?.role} onOpen={setSource} />
                  <MessageCandidateReferences references={optimistic?.candidates || []} onOpen={setSource} />
                  {!!optimistic?.files?.length && <div className="ws-message-attachments">
                    {optimistic.files.map(item => <MessageAttachment key={item.id} name={item.file.name} size={item.file.size} file={item.file} />)}
                  </div>}
                  {message.content.trim() && <div className="ws-message-prose"><AgentText content={message.content} /></div>}
                  <div className="ws-message-tools" aria-hidden="true" />
                </article>
              ) : <ConversationMessage key={key} message={message}
                activeJob={activeJob} receivingFiles={sending && !!optimistic?.files?.length}
                onSuggestionReply={!sending && !pending && index === displayedMessages.length - 1 && message.metadata.turn_status !== "cancelled" ? reply => { void send(undefined, reply); } : undefined}
                onRetry={retry} disconnected={!sending && disconnected}
                importRefresh={job?.status === "done" ? job.id : undefined}
                laterScheduleIds={displayedMessages.slice(index + 1).flatMap(item => (item.message.metadata as AssistantMeta).schedules?.map(schedule => schedule.id) || [])}
                onReady={query.refresh} onRevise={document => { setSource(null); setRevisionTarget(document); setDraft(`${document.title}: ${t("Please revise the document: ")}`); composer.current?.focus(); }}
                onMemories={() => setMemoriesOpen(true)} onSource={source => { setRevisionTarget(null); setContextOpen(false); setSource(source); }}
                onReview={(messageId, action) => setReview({messageId, action})} onCopy={(id, content) => void copyConversationMessage(id, content, setCopiedId, setError)} copiedId={copiedId}
              />)
            )}

            {query.data?.work?.filter(work => !query.data?.messages.some(message => (message.metadata as AssistantMeta).work?.some(receipt => receipt.job_id === work.id))).map(work => <AssistantWork key={work.id} receipt={{ job_id: work.id, kind: "search_update", title: t("Your agreed recurring update") }} onReady={query.refresh} onRevise={document => { setSource(null); setRevisionTarget(document); setDraft(`${document.title}：${t("Please revise the draft: ")}`); composer.current?.focus(); }} />)}

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
          <ConversationQueue jobs={queued} stopped={stopped} failed={job?.status === "error"} busy={stopping} onControl={control} />
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
            {selectedContext && <div className="ws-composer-context-tags ws-composer-selected-source"><span className="ws-composer-context-tag">{revisionTarget ? <Pencil size={12} /> : <Paperclip size={12} />}<span>{t(revisionTarget ? "Revising" : "Discussing")}: {selectedContext.title}</span><button type="button" className="ws-icon" onClick={() => { setRevisionTarget(null); setSource(null); }} aria-label={t("Clear context")}><X size={12} /></button></span></div>}
            {!sending && mentions.picker}
            {!sending && mentions.tags}
            <ErrorNotice error={attachmentDraftError} />
            <input
              ref={fileInput}
              className="sr-only"
              tabIndex={-1}
              aria-label={t("Add files")}
              type="file"
              multiple
              disabled={sending || !attachmentsReady}
              accept={ATTACHMENT_ACCEPT}
              onChange={(e) => chooseFiles(e.target.files)}
            />
            {attachments.length > 0 && !sending && (
              <div className="ws-composer-files" aria-live="polite">
                {attachments.map((item) => (
                  <div key={item.id} className={`ws-composer-attachment ${item.status === "error" ? "has-error" : ""}`}>
                    {!attachmentError(item.file.name, item.file.size) && <AttachmentThumbnail name={item.file.name} file={item.file} />}
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
            {!sending && attachments.some(item => attachmentError(item.file.name, item.file.size)) && <p className="ws-attachment-error" role="status">{t("Remove the unsupported or oversized file to send the remaining message.")}</p>}
            {(roleId || linkedPersonId) && (
              <div className="ws-composer-context-tags">
                {roleId && <ComposerReference kind="role" name={activeRole ? `${activeRole.client_name} · ${activeRole.title}` : t("Role")} removeLabel={t("Remove role from conversation")} onRemove={documentId && !conversationId ? undefined : () => { if (new URLSearchParams(window.location.search).has("role")) removeNewConversationContext("role"); else setRoleId(""); }} />}
                {linkedPersonId && <ComposerReference kind="candidate" name={person.data?.person.name || t("Candidate")} removeLabel={t("Remove candidate from conversation")} onRemove={() => removeNewConversationContext("person")} />}
              </div>
            )}

            <textarea
              ref={composer}
              aria-label={t("Message your AI assistant")}
              role="combobox"
              aria-expanded={mentions.open}
              aria-autocomplete="list"
              aria-controls={mentions.open ? "candidate-mentions" : undefined}
              aria-activedescendant={mentions.selectedId}
              value={sending ? "" : draft}
              onChange={(e) => mentions.update(e.target.value, e.target.selectionStart)}
              placeholder={t(selectedContext ? "Ask about this item…" : "Ask, paste a JD, or share a conversation note…")}
              rows={1}
              maxLength={50000}
              disabled={!draftReady}
              readOnly={sending}
              onKeyDown={onComposerKeyDown}
            />
            <div className="ws-composer-footer">
              <button
                type="button"
                className="ws-attach-button"
                disabled={sending || !attachmentsReady}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={14} />
                {t("Add files")}
              </button>
              <span>
                {pending
                  ? (locale === "zh" ? "发送后加入队列 · 纠正当前要求可选立即处理" : "Send to queue · Send now to redirect current work")
                  : stopped ? (locale === "zh" ? "已停止 · 新消息会保留在队列中" : "Stopped · New messages will stay queued") : t("Enter to send · Shift + Enter for a new line")}
              </span>
              {((pending && !stopped) || sending) ? <button
                type="button"
                className="ws-button ws-button-primary ws-stop-button"
                disabled={stopping}
                aria-label={t("Stop response")}
                title={t("Stop response")}
                onClick={() => void stop()}
              >{stopping ? <Loader2 size={14} className="animate-spin" /> : <Square size={13} fill="currentColor" />}</button> : null}
              {!sending && (pending || stopped) && (!!draft.trim() || !!attachments.length) && <button type="button" className="ws-link" disabled={stopping || !attachmentsReady} onClick={()=>void send(undefined,undefined,"immediate")}>{locale === "zh" ? "立即处理" : "Send now"}</button>}
              {!sending && (!pending || !!draft.trim() || !!attachments.length) && <button
                type="submit"
                className="ws-button ws-button-primary"
                aria-label={pending || stopped ? (locale === "zh" ? "加入队列" : "Add to queue") : t("Send message")}
                title={pending || stopped ? (locale === "zh" ? "加入队列" : "Add to queue") : t("Send message")}
                disabled={
                  (!draft.trim() && !attachments.length) ||
                  !attachmentsReady || sending ||
                  attachments.some((item) => item.status === "uploading") ||
                  attachments.some(item => !!attachmentError(item.file.name, item.file.size))
                }
              >
                <ArrowUp size={16} />
              </button>}
            </div>
          </form>
        </section>
        {source && <ContextPanel source={source} onClose={() => setSource(null)} onTitle={title => setSource(current => current ? {...current, title} : current)} />}
        {contextOpen && <aside className="ws-assistant-context" aria-label={t("Choose role")}>
          <div className="ws-context-heading"><strong>{t("Choose role")}</strong><button className="ws-icon" onClick={() => setContextOpen(false)} aria-label={t("Close")}><X size={16} /></button></div>
          <button className="ws-button" onClick={() => { setContextOpen(false); router.push(`/app?prompt=${encodeURIComponent(t("Save a role from the JD and client context I provide."))}`); }}>{t("Add role")}</button>
          {roles.data?.roles.map(role => <button className="ws-detail-link" key={role.id} onClick={() => { setRoleId(role.id); setSource(null); setContextOpen(false); }}>{role.client_name} · {role.title}</button>)}
          <Link className="ws-link" href="/app/roles">{t("View all roles")} <ArrowUpRight size={13} /></Link>
        </aside>}
      </div>
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

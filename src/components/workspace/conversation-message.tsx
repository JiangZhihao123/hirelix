"use client";

import { ConversationExports } from "./document-download";
import { ConversationEmail } from "./conversation-email";
import { ConversationQuestion } from "./conversation-question";
import { TurnParts } from "./turn-parts";
import { turnParts } from "@/lib/workspace/turn-progress";
import { TurnActivity, TurnStatus } from "./turn-activity";
import Link from "next/link";
import { ArrowUpRight, Paperclip, Check, Copy } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { BrandMark } from "@/components/BrandMark";
import { AgentText } from "@/components/AgentText";
import { ReminderReceipt } from "./reminder";
import { AttachmentThumbnail } from "./attachment-thumbnail";
import { date } from "./client";
import { ConversationImport } from "./import-review";
import { AssistantWork, AssistantAgreement, ConversationRevision } from "./assistant-work";
import { messageAttachments, messageImportJobs } from "@/lib/workspace/attachments";
import type { AssistantAction, AssistantMeta } from "@/lib/workspace/conversations";
import type { Message, Deliverable, Job } from "@/lib/workspace/types";

function MessageSources({ sources, onSource }: { sources: NonNullable<AssistantMeta["sources"]>; onSource: (source: { title: string; href: string }) => void }) {
  const t = useT();
  const links = <div className="ws-message-sources">
    {sources.map((source, index) => !source.href.startsWith("/")
      ? <a key={`${source.href}:${index}`} href={source.href} target="_blank" rel="noopener noreferrer">{source.title}<ArrowUpRight size={12} /></a>
      : <button key={`${source.href}:${index}`} type="button" onClick={() => onSource(source)}>
      {source.title}<ArrowUpRight size={12} />
    </button>)}
  </div>;
  return <details className="ws-message-source-disclosure">
    <summary>{t("Sources")} <span>{sources.length}</span></summary>
    {links}
  </details>;
}

export function ConversationMessage({ message, importRefresh, laterScheduleIds, onReady, onRevise, onMemories, onSource, onReview, onCopy, copiedId, activeJob, onRetry, disconnected }: {
  activeJob?: Job; onRetry?: () => Promise<void>; disconnected?: boolean;
  message: Message; importRefresh?: string; laterScheduleIds: string[]; onReady: () => void;
  onRevise: (document: Deliverable) => void; onMemories: () => void;
  onSource: (source: {title: string; href: string}) => void;
  onReview: (messageId: string, action: AssistantAction) => void;
  onCopy: (id: string, content: string) => void; copiedId: string | null;
}) {
  const t = useT();
  const metadata = message.metadata as AssistantMeta;
  const parts = turnParts(message.metadata);
  const displayedSources = new Set(parts.flatMap(part => part.type === "tool" ? (part.sources || []).map(source => source.href) : []));
  if (metadata.exports) displayedSources.add(`/app/submissions/${metadata.exports.document_id}`);
  metadata.document_edits?.forEach(document => displayedSources.add(document.href));
  const remainingSources = metadata.sources?.filter(source => !displayedSources.has(source.href)) || [];
  return (
                  <article
                    className={`ws-message ws-message-${message.role}`}
                    aria-label={message.role === "user" ? t("Your message") : t("Hirelix")}

                  >
                    {message.role === "assistant" && (
                      <div className="ws-message-label">
                        <span className="ws-message-avatar ws-message-avatar-assistant">
                          <BrandMark small />
                        </span>
                        <strong>{t("Hirelix")}</strong>
                        {activeJob && <TurnStatus job={activeJob} disconnected={disconnected} />}
                        <time dateTime={message.created_at}>{date(message.created_at, true)}</time>
                      </div>
                    )}
                    {!activeJob && !!parts.length && <TurnParts parts={parts} onOpenLink={(href, label) => {
                      const source = metadata.sources?.find(item => item.href === href);
                      if (!source || !source.href.startsWith("/")) return false;
                      onSource({title: label || source.title, href});
                      return true;
                    }} />}
                    <div className="ws-message-prose">
                      <AgentText content={parts.length || activeJob || message.metadata.turn_status === "cancelled" || metadata.question?.question === message.content ? "" : message.content} onOpenLink={(href, label) => {
                        const source = metadata.sources?.find(item => item.href === href);
                        if (source) { if (!source.href.startsWith("/")) return false; onSource(source); return true; }
                        // A saved document may be cited from earlier conversation
                        // context without being read again in this turn.
                        let url: URL;
                        try { url = new URL(href, window.location.origin); } catch { return false; }
                        if (url.origin !== window.location.origin || !/^\/app\/(?:submissions|roles\/[a-f0-9-]+\/updates)\/[a-f0-9-]+$/.test(url.pathname)) return false;
                        onSource({ title: label || t("Saved document"), href: url.pathname }); return true;
                      }} />
                      {messageAttachments(message.metadata).map((file) => (
                        <button key={file.file_id} type="button" className="ws-chat-attachment" onClick={() => onSource({title: file.name, href: `/api/workspace/files/${file.file_id}`})}>
                          <AttachmentThumbnail name={file.name} href={`/api/workspace/files/${file.file_id}?preview=1`} />
                          <Paperclip size={14} /><span>{file.name}</span>
                        </button>
                      ))}
                    </div>
                    {activeJob && <TurnActivity job={activeJob} embedded disconnected={disconnected} onRetry={onRetry} />}
                    {message.metadata.turn_status === "cancelled" && <p className="ws-message-status" role="status">{t("Stopped. You can send a new instruction.")}</p>}
                    {messageImportJobs(message.metadata).map((jobId) => (
                      <ConversationImport key={jobId} jobId={jobId} embedded={message.role === "assistant"} refreshToken={importRefresh} />
                    ))}
                    {metadata.exports && <ConversationExports documentId={metadata.exports.document_id} formats={metadata.exports.formats} />}
                    {(metadata.email || metadata.gmail) && <ConversationEmail email={metadata.email} conversationId={message.conversation_id!} messageId={message.id} onChanged={onReady} />}
                    {metadata.question && <ConversationQuestion question={metadata.question} conversationId={message.conversation_id!} messageId={message.id} onChanged={onReady} />}
                    {metadata.work?.map(receipt => <AssistantWork key={receipt.job_id} receipt={receipt} exportedDocumentId={metadata.exports?.document_id} onReady={onReady} onRevise={onRevise} onOpen={document => onSource({title: document.title, href: document.kind === "search_update" ? `/app/roles/${document.role_id}/updates/${document.id}` : `/app/submissions/${document.id}`})} />)}
                    {metadata.schedules?.filter(receipt => !laterScheduleIds.includes(receipt.id)).map(receipt => <AssistantAgreement key={receipt.id} receipt={receipt} />)}
                    {metadata.reminders?.map(item => <ReminderReceipt key={item.id} id={item.id} />)}
                    {metadata.revision && <ConversationRevision revision={metadata.revision} onApplied={onReady} />}
                    {!!metadata.document_edits?.length && <p className="ws-message-status">{t("Updated · Previous version kept")}</p>}
                    {!!remainingSources.length && <MessageSources sources={remainingSources} onSource={onSource} />}
                    {!!metadata.memories?.length && <div className="ws-memory-receipts">
                      {metadata.memories.map(memory => <button key={memory.id} type="button" onClick={() => onMemories()}>
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
                              : action.kind === "create_candidate" || action.kind === "update_candidate"
                                ? t("Candidate changes ready to review")
                              : action.kind === "create_role"
                                ? t("Review the role details before saving")
                                : action.kind === "update_role_brief"
                                  ? t(
                                      "Review the proposed requirements before applying",
                                    )
                                  : action.kind === "add_record"
                                    ? t("Review this record before adding it")
                                    : action.kind === "update_relationship" || action.kind === "update_role_details" || action.kind === "record_submission"
                                      ? t("Review conversation record")
                                    : action.kind === "update_sharing_permission"
                                      ? t("Review the evidence and sharing permission before saving")
                                    : t(
                                        "Choose the people and source material to include",
                                      )}
                          </small>
                        </div>
                        {action.href && action.status === "saved" ? (
                          <button className="ws-button" onClick={() => onSource({title: action.title, href: action.href!})}><Check size={13} />{t("Open saved item")}<ArrowUpRight size={13} /></button>
                        ) : action.href ? (
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
                              onReview(message.id, action)
                            }
                          >
                            {t("Review & save")}
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="ws-message-tools">
                      {message.role === "user" && <time dateTime={message.created_at}>{date(message.created_at, true)}</time>}
                      {message.content && message.metadata.turn_status !== "cancelled" && <button
                        type="button"
                        onClick={() => onCopy(message.id, message.content)}
                        aria-label={t("Copy message")}
                      >
                        <Copy size={13} />
                        {copiedId === message.id ? t("Copied") : t("Copy")}
                      </button>}
                    </div>
                  </article>

  );
}

"use client";
import { MessageRoleReference } from "./message-role-reference";
import { DocumentReference } from "./document-reference";
import { MessageCandidateReferences } from "./message-candidate-references";

import { ConversationExports } from "./document-download";
import { ConversationEmail } from "./conversation-email";
import { ConversationQuestion } from "./conversation-question";
import { TurnParts } from "./turn-parts";
import { viewedSourceFromHref } from "@/lib/workspace/source-context";
import { feedbackLabels } from "@/lib/workspace/recommendation-feedback-contract";
import { isTurnRunning, turnParts } from "@/lib/workspace/turn-progress";
import { candidateReferences } from "@/lib/workspace/candidate-references";
import { TurnActivity } from "./turn-activity";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, MessageSquare } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { BrandMark } from "@/components/BrandMark";
import { AgentText, AssistantReplies } from "@/components/AgentText";
import { ReminderReceipt } from "./reminder";
import { MessageAttachment } from "./message-attachment";
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
    <summary>{t("Web references")} <span>{sources.length}</span></summary>
    {links}
  </details>;
}

export function ConversationMessage({ onSuggestionReply, message, importRefresh, laterScheduleIds, onReady, onRevise, onMemories, onSource, onReview, onCopy, copiedId, activeJob, onRetry, disconnected, receivingFiles }: {
  onSuggestionReply?: (reply: string) => void;
  receivingFiles?: boolean; activeJob?: Pick<Job, "status" | "progress" | "error" | "result">; onRetry?: () => Promise<void>; disconnected?: boolean;
  message: Message; importRefresh?: string; laterScheduleIds: string[]; onReady: () => void;
  onRevise: (document: Deliverable) => void; onMemories: () => void;
  onSource: (source: {title: string; href: string}) => void;
  onReview: (messageId: string, action: AssistantAction) => void;
  onCopy: (id: string, content: string) => void; copiedId: string | null;
}) {
  const t = useT();
  const metadata = message.metadata as AssistantMeta;
  const sourceLinks = [...(metadata.sources || []).map(source => source.href), ...(metadata.recommendation_links || []).map(link => link.href)];
  const showReceipts = !isTurnRunning(activeJob);
  const parts = turnParts(activeJob?.result ?? message.metadata);
  const prose = parts.length || message.metadata.turn_status === "cancelled" || metadata.question?.question === message.content ? "" : String(activeJob?.result?.live_reply || message.content);
  const displayedSources = new Set(parts.flatMap(part => part.type === "tool" ? (part.sources || []).map(source => source.href) : []));
  if (metadata.exports) displayedSources.add(`/app/submissions/${metadata.exports.document_id}`);
  metadata.document_edits?.forEach(document => displayedSources.add(document.href));
  const remainingSources = metadata.sources?.filter(source => /^https?:\/\//.test(source.href) && !viewedSourceFromHref(source.href) && !displayedSources.has(source.href)) || [];
  const feedback = metadata.recommendation_feedback;
  const savedActions = [...new Map((metadata.actions || []).filter(action => action.status === "saved").map(action => [action.href || action.id, action])).values()];
  if (feedback) return <article className="ws-message ws-feedback-receipt" data-message-key={message.id} aria-label={t("Client feedback")}>
    <header><MessageSquare size={15} /><span>{t("Client feedback")}</span><time dateTime={message.created_at} title={date(message.created_at, true)}>{new Date(message.created_at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", hour12: false})}</time></header>
    <div className="ws-feedback-subject"><strong>{feedback.person_name}</strong><span>{t(feedbackLabels[feedback.response])}</span></div>
    {feedback.comment && <p>{feedback.comment}</p>}
    <footer><span>{feedback.submitted_name} · {t("Name not verified")}</span><button type="button" onClick={() => onSource({title: t("Client feedback"), href: feedback.href})}>{t("View record")}<ArrowUpRight size={12} /></button></footer>
  </article>;
  return (
                  <article
                    className={`ws-message ws-message-${message.role}`}
                    data-message-key={message.metadata.reply_request_key as string || message.id}
                    aria-label={message.role === "user" ? t("Your message") : t("Hirelix")}

                  >
                    {message.role === "assistant" && (
                      <div className="ws-message-label">
                        <span className="ws-message-avatar ws-message-avatar-assistant">
                          <BrandMark small />
                        </span>
                        <strong>{t("Hirelix")}</strong>
                        {message.created_at && <time dateTime={message.created_at} title={date(message.created_at, true)}>{new Date(message.created_at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", hour12: false})}</time>}
                      </div>
                    )}
                    {!!messageAttachments(message.metadata).length && <div className="ws-message-attachments">
                      {messageAttachments(message.metadata).map((file) => (
                        <MessageAttachment key={file.file_id} id={file.file_id} name={file.name} size={file.size} onOpen={() => onSource({title: file.name, href: `/api/workspace/files/${file.file_id}`})} />
                      ))}
                    </div>}
                    {message.role === "user" && (Array.isArray(message.metadata.role_references) ? message.metadata.role_references : [message.metadata.role_reference]).map((reference, index) => <MessageRoleReference key={index} reference={reference} onOpen={onSource} />)}
                    {message.role === "user" && <MessageCandidateReferences references={candidateReferences(message.metadata.candidate_references)} onOpen={onSource} />}
                    {message.role === "user" && <DocumentReference reference={metadata.document_reference} atSend onOpen={onSource} />}
                    {!!parts.length && <TurnParts sourceLinks={sourceLinks} parts={parts} running={activeJob?.status === "queued" || activeJob?.status === "running"} onOpenLink={(href, label) => {
                      const source = metadata.sources?.find(item => item.href === href);
                      if (!viewedSourceFromHref(href)) return false;
                      onSource({title: label || source?.title || t("View result"), href});
                      return true;
                    }} />}
                    {!!prose.trim() && <div className="ws-message-prose">
                      <AgentText sourceLinks={sourceLinks} content={prose} onOpenLink={(href, label) => {
                        const source = metadata.sources?.find(item => item.href === href);
                        if (source) { if (!source.href.startsWith("/")) return false; onSource(source); return true; }
                        // A saved document may be cited from earlier conversation
                        // context without being read again in this turn.
                        let url: URL;
                        try { url = new URL(href, window.location.origin); } catch { return false; }
                        if (url.origin !== window.location.origin || !/^\/app\/(?:submissions|roles\/[a-f0-9-]+\/updates)\/[a-f0-9-]+$/.test(url.pathname)) return false;
                        onSource({ title: label || t("Saved document"), href: url.pathname }); return true;
                      }} />

                    </div>}
                    {!activeJob && message.metadata.turn_status === "cancelled" && <p className="ws-message-status" role="status">{t("Stopped")}</p>}
                    {showReceipts && <>
                    {messageImportJobs(message.metadata).map((jobId) => (
                      <ConversationImport key={jobId} jobId={jobId} embedded={message.role === "assistant"} refreshToken={importRefresh} />
                    ))}
                    {metadata.exports && <ConversationExports documentId={metadata.exports.document_id} formats={metadata.exports.formats} />}
                    {metadata.recommendation_links?.map((link, index) => <div className="ws-recommendation-receipt" key={`${link.document_id}:${link.version}:${index}`}>
                      <a className="ws-link" href={link.href} target="_blank" rel="noopener noreferrer">{t("Open client recommendation")}<ArrowUpRight size={14} /></a>
                      <span className="ws-message-status">{t("Published copy")} · {t("Version")} {link.version}</span>
                    </div>)}
                    {(metadata.email || metadata.email_result || metadata.gmail) && <ConversationEmail mailboxProvider={metadata.gmail?.provider} email={metadata.email_result || metadata.email} conversationId={message.conversation_id!} messageId={metadata.email_result?.preview_message_id || message.id} onChanged={onReady} />}
                    {metadata.work?.map(receipt => <AssistantWork key={receipt.job_id} receipt={receipt} exportedDocumentId={metadata.exports?.document_id} onReady={onReady} onRevise={onRevise} onOpen={document => onSource({title: document.title, href: document.kind === "search_update" ? `/app/roles/${document.role_id}/updates/${document.id}` : `/app/submissions/${document.id}`})} />)}
                    {metadata.schedules?.filter(receipt => !laterScheduleIds.includes(receipt.id)).map(receipt => <AssistantAgreement key={receipt.id} receipt={receipt} />)}
                    {metadata.reminders?.map(item => <ReminderReceipt key={item.id} id={item.id} />)}
                    {metadata.revision && <ConversationRevision revision={metadata.revision} onApplied={onReady} />}
                    {!!metadata.memories?.length && <div className="ws-memory-receipts">
                      {metadata.memories.map(memory => <button key={memory.id} type="button" onClick={() => onMemories()}>
                        <Check size={13} />{t(memory.operation === "forget" ? "Forgotten" : memory.operation === "update" ? "Agreement updated" : "Remembered")} · {memory.title}
                      </button>)}
                    </div>}
                    {!!savedActions.length && <details className="ws-saved-items">
                      <summary><Check size={13} />{t("Saved items")} <span>· {savedActions.length}</span></summary>
                      <ul>{savedActions.map(action => <li key={action.id}>{action.href
                        ? <button type="button" onClick={() => onSource({title: t(action.title), href: action.href!})}>{t(action.title)}<ArrowUpRight size={13} /></button>
                        : <span>{t(action.title)}</span>}</li>)}</ul>
                    </details>}
                    {metadata.actions?.filter(action => action.status !== "saved").map((action) => (
                      <div className="ws-action-proposal" key={action.id}>
                        <div>
                          <strong>{t(action.title)}</strong>
                          <small>
                            {action.kind === "create_candidate" || action.kind === "update_candidate"
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
                        {action.href ? (
                          <Link className="ws-button" href={action.href}>
                            {t("Prepare")}<ArrowUpRight size={13} />
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
                    </>}
                    {activeJob && <TurnActivity job={activeJob} embedded hideContent receivingFiles={receivingFiles} disconnected={disconnected} onRetry={onRetry} />}
                    <div className="ws-message-tools">
                      {!!remainingSources.length && <MessageSources sources={remainingSources} onSource={onSource} />}
                      {!!metadata.document_edits?.length && !metadata.recommendation_links?.length && <span className="ws-message-status">{t("Updated · Previous version kept")}</span>}
                      {message.role === "user" && <time dateTime={message.created_at} title={date(message.created_at, true)}>{new Date(message.created_at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", hour12: false})}</time>}
                      {message.content && message.metadata.turn_status !== "cancelled" && <button
                        type="button"
                        onClick={() => onCopy(message.id, message.content)}
                        title={copiedId === message.id ? t("Copied") : t("Copy message")}
                        aria-label={copiedId === message.id ? t("Copied") : t("Copy message")}
                      >
                        {copiedId === message.id ? <Check size={13} /> : <Copy size={13} />}
                        {message.role !== "user" && (copiedId === message.id ? t("Copied") : t("Copy"))}
                      </button>}
                    </div>
                    {showReceipts && metadata.question && <ConversationQuestion question={metadata.question} onReply={onSuggestionReply} />}
                    {message.role === "assistant" && !metadata.question && onSuggestionReply && <AssistantReplies content={parts.length ? parts.filter(part => part.type === "text").map(part => part.text).join("\n") : message.content} onReply={onSuggestionReply} />}
                  </article>

  );
}

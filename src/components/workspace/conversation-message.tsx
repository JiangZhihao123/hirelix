"use client";
import Link from "next/link";
import { ArrowUpRight, Paperclip, Check, Copy } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { BrandMark } from "@/components/BrandMark";
import { AgentText } from "@/components/AgentText";
import { ReminderReceipt } from "./reminder";
import { date } from "./client";
import { ConversationImport } from "./import-review";
import { AssistantWork, AssistantAgreement, ConversationRevision } from "./assistant-work";
import { messageAttachments, messageImportJobs } from "@/lib/workspace/attachments";
import type { AssistantAction, AssistantMeta } from "@/lib/workspace/conversations";
import type { Message, Deliverable } from "@/lib/workspace/types";
export function ConversationMessage({ message, importRefresh, laterScheduleIds, onReady, onRevise, onMemories, onSource, onReview, onCopy, copiedId }: {
  message: Message; importRefresh?: string; laterScheduleIds: string[]; onReady: () => void;
  onRevise: (document: Deliverable) => void; onMemories: () => void;
  onSource: (source: {title: string; href: string}) => void;
  onReview: (messageId: string, action: AssistantAction) => void;
  onCopy: (id: string, content: string) => void; copiedId: string | null;
}) {
  const t = useT();
  const metadata = message.metadata as AssistantMeta;
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
                        <time dateTime={message.created_at}>{date(message.created_at, true)}</time>
                      </div>
                    )}
                    <div className="ws-message-prose">
                      <AgentText content={message.content} onOpenLink={href => {
                        const source = metadata.sources?.find(item => item.href === href);
                        if (!source) return false;
                        onSource(source); return true;
                      }} />
                      {messageAttachments(message.metadata).map((file) => (
                        <a key={file.file_id} className="ws-chat-attachment" href={`/api/workspace/files/${file.file_id}`}>
                          <Paperclip size={14} />{file.name}
                        </a>
                      ))}
                    </div>
                    {messageImportJobs(message.metadata).map((jobId) => (
                      <ConversationImport key={jobId} jobId={jobId} embedded={message.role === "assistant"} refreshToken={importRefresh} />
                    ))}
                    {metadata.work?.map(receipt => <AssistantWork key={receipt.job_id} receipt={receipt} onReady={onReady} onRevise={onRevise} onOpen={document => onSource({title: document.title, href: document.kind === "search_update" ? `/app/roles/${document.role_id}/updates/${document.id}` : `/app/submissions/${document.id}`})} />)}
                    {metadata.schedules?.filter(receipt => !laterScheduleIds.includes(receipt.id)).map(receipt => <AssistantAgreement key={receipt.id} receipt={receipt} />)}
                    {metadata.reminders?.map(item => <ReminderReceipt key={item.id} id={item.id} />)}
                    {metadata.revision && <ConversationRevision revision={metadata.revision} onApplied={onReady} />}
                    {metadata.sources?.length ? (
                      <div className="ws-message-sources">
                        {metadata.sources.map((source, index) => (
                          <button key={index} type="button" onClick={() => { onSource(source); }}>
                            {source.title}<ArrowUpRight size={12} />
                          </button>
                        ))}
                      </div>
                    ) : null}
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
                      <button
                        type="button"
                        onClick={() => onCopy(message.id, message.content)}
                        aria-label={t("Copy message")}
                      >
                        <Copy size={13} />
                        {copiedId === message.id ? t("Copied") : t("Copy")}
                      </button>
                    </div>
                  </article>

  );
}

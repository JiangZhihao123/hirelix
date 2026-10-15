"use client";
import { useState } from "react";
import { ArrowUp, X, Pencil, Check } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { Job } from "@/lib/workspace/types";

export function ConversationQueue({
  jobs,
  busy,
  onControl,
}: {
  jobs: Job[];
  busy: boolean;
  onControl: (
    action: string,
    jobId?: string,
    message?: string,
  ) => Promise<void>;
}) {
  const { locale } = useLanguage(),
    zh = locale === "zh";
  const [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState("");
  if (!jobs.length) return null;
  return (
    <div className="ws-conversation-queue">
      {jobs.length > 0 && (
        <details open={jobs.length <= 2}>
          <summary>
            {zh ? `待处理 · ${jobs.length} 条` : `Queued · ${jobs.length}`}
          </summary>
          <ol>
            {jobs.map((job) => {
              const text = String(
                (job.payload.request as { message?: string })?.message ||
                  (zh ? "附件消息" : "Attached files"),
              );
              return (
                <li key={job.id}>
                  {editing === job.id ? (
                    <>
                      <textarea
                        aria-label={zh ? "编辑排队消息" : "Edit queued message"}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        maxLength={50000}
                      />
                      <button
                        type="button"
                        className="ws-icon"
                        aria-label={zh ? "保存修改" : "Save changes"}
                        disabled={busy || !draft.trim()}
                        onClick={() =>
                          void onControl("edit", job.id, draft)
                            .then(() => setEditing(null))
                            .catch(() => {})
                        }
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        className="ws-icon"
                        aria-label={zh ? "取消修改" : "Cancel edit"}
                        onClick={() => setEditing(null)}
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <p title={text}>{text}</p>
                      <button
                        type="button"
                        className="ws-icon"
                        aria-label={zh ? "立即处理" : "Send now"}
                        title={zh ? "立即处理" : "Send now"}
                        disabled={busy}
                        onClick={() =>
                          void onControl("immediate", job.id).catch(() => {})
                        }
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="ws-icon"
                        disabled={busy}
                        aria-label={zh ? "编辑排队消息" : "Edit queued message"}
                        title={zh ? "编辑排队消息" : "Edit queued message"}
                        onClick={() => {
                          setDraft(text);
                          setEditing(job.id);
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="ws-icon"
                        disabled={busy}
                        aria-label={
                          zh ? "移除排队消息" : "Remove queued message"
                        }
                        onClick={() =>
                          void onControl("remove", job.id).catch(() => {})
                        }
                      >
                        <X size={14} />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </div>
  );
}

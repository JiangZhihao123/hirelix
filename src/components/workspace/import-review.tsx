"use client";

import { useLanguage, useT } from "@/components/LanguageProvider";
import { useEffect } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ErrorNotice, Loading, useQuery } from "@/components/workspace/client";
import type { Job } from "@/lib/workspace/types";

type Preview = {
  job: Job;
  counts: Array<{ status: string; count: number }>;
  savedProfiles?: Array<{ id: string; name: string }>;
};
type BatchResult = {
  total: number;
  counts: { applied: number; unchanged: number; conflict: number; failed: number; unprocessed: number };
  result_file_id?: string;
};

/** Receipts stay with the conversation; corrections are handled by the Agent. */
export function ConversationImport({
  jobId,
  embedded = false,
  refreshToken,
}: {
  jobId: string;
  embedded?: boolean;
  refreshToken?: string;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const preview = useQuery<Preview>(`/imports/${jobId}`);
  const refresh = preview.refresh;
  useEffect(() => { if (refreshToken) refresh(); }, [refreshToken, refresh]);
  const job = preview.data?.job;
  const pending = !!job && ["queued", "running"].includes(job.status);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(refresh, 1800);
    return () => clearInterval(timer);
  }, [pending, refresh]);
  const state = job?.result?.record_batch as BatchResult | undefined;
  const counts = state?.counts;
  const batch = job?.payload.operation === "record_batch";
  const input = batch ? job.payload.input_file as { file_id: string } | undefined : undefined;
  const fileId = input?.file_id || (typeof job?.payload.file_id === "string" ? job.payload.file_id : undefined);
  return (
    <section className="ws-chat-import" aria-label={locale === "zh" ? "资料保存结果" : "Record results"}>
      {!embedded && <div className="ws-message-label">{t("Hirelix")}</div>}
      <ErrorNotice error={preview.error || job?.error || ""} retry={preview.refresh} />
      {!job && !preview.error && <Loading>{t("Opening your file…")}</Loading>}
      {pending && <Loading>{locale === "zh" ? "正在保存整理好的资料…" : "Saving organized records…"}</Loading>}
      {counts && <p>{locale === "zh"
        ? `已保存 ${counts.applied} 条，未变更 ${counts.unchanged} 条；冲突 ${counts.conflict} 条，失败 ${counts.failed} 条，未处理 ${counts.unprocessed} 条。`
        : `${counts.applied} saved, ${counts.unchanged} unchanged; ${counts.conflict} conflicts, ${counts.failed} failed, ${counts.unprocessed} unprocessed.`}</p>}
      {state?.result_file_id && <a className="ws-link" href={`/api/workspace/files/${state.result_file_id}`} download>
        {locale === "zh" ? "下载逐项处理结果" : "Download item results"}<ArrowUpRight size={13} />
      </a>}
      {job && !batch && <>
        <p>{locale === "zh" ? "先前保存的导入记录" : "Previously saved import results"}</p>
        {preview.data?.counts.map(item => <span className="ws-tag" key={item.status}>{item.count} {t(item.status)}</span>)}
        {preview.data?.savedProfiles?.map(person => <p key={person.id}>
          <Link href={`/app/candidates?person=${person.id}`}>{person.name}<ArrowUpRight size={13} /></Link>
        </p>)}
      </>}
      {job && job.status !== "done" && !pending && <p className="ws-muted">{locale === "zh"
        ? "已保存的结果会保留。可以在此对话中继续处理。"
        : "Saved results are retained. Continue the work in this conversation."}</p>}
      {fileId && <a className="ws-import-original" href={`/api/workspace/files/${fileId}`} download>
        {batch ? (locale === "zh" ? "下载本次写入数据" : "Download batch input") : t("Download original")}
      </a>}
    </section>
  );
}

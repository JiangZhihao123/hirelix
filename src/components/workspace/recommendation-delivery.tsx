"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Link as LinkIcon,
  Mail,
  Check,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { api, Dialog, ErrorNotice, Field, useQuery } from "./client";
import type { Deliverable } from "@/lib/workspace/types";
import type { SubmissionCv } from "@/lib/workspace/deliverables";
type Share = { id: string; path: string; version: number; expires_at: string };
type Receipt = {
  id: string;
  status: string;
  recipient: string;
  deliverable_version: number;
  current_copy: boolean;
  error: string | null;
};
export function RecommendationDelivery({
  document,
  disabled,
}: {
  document: Deliverable;
  disabled: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const { locale } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="ws-button ws-button-primary"
        disabled={disabled}
        onClick={() => router.push(`/app?document=${document.id}&role=${document.role_id}&prompt=${encodeURIComponent(locale === "zh" ? "请帮我通过邮件发送这份已保存的推荐材料。" : "Help me email this saved recommendation to the client.")}`)}
      >
        <Mail size={14} />
        {t("Deliver to client")}
      </button>
      <button className="ws-button" disabled={disabled} onClick={() => setOpen(true)}>{t("Share link or copy")}</button>
      {open && <Dialog title={t("Share link or copy")} onClose={() => setOpen(false)}><DeliveryOptions document={document} /></Dialog>}
    </>
  );
}
function DeliveryOptions({
  document,
}: {
  document: Deliverable;
}) {
  const t = useT();
  const [mode, setMode] = useState<"link" | "copy" | "gmail">("link"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState("");
  const share = useQuery<{ share: Share | null }>(
    `/deliverables/${document.id}/share`,
  );
  const receipts = useQuery<{ receipts: Receipt[] }>(
    `/deliverables/${document.id}/email`,
  );
  const source = document.source_snapshot as {
    files?: SubmissionCv[];
    people?: Array<{ id: string; name: string }>;
  };
  const active = share.data?.share;
  const inProgress = receipts.data?.receipts.some(
    (r) => r.status === "sending",
  );
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(receipts.refresh, 3000);
    return () => clearInterval(timer);
  }, [inProgress, receipts.refresh]);
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setError("Could not access the clipboard. Select and copy the text.");
    }
  }
  async function publish() {
    setBusy(true);
    setError("");
    try {
      await api(`/deliverables/${document.id}/share`, {
        method: "POST",
        body: JSON.stringify({ expected_version: document.version }),
      });
      share.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create share link");
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    setBusy(true);
    setError("");
    try {
      await api(`/deliverables/${document.id}/share`, { method: "DELETE" });
      share.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke link");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ws-delivery">
      <div
        className="ws-delivery-tabs"
        role="tablist"
        aria-label={t("Delivery method")}
      >
        {(
          [
            ["link", "Share link", LinkIcon],
            ["copy", "Copy email", Copy],
            ["gmail", "Gmail", Mail],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            type="button"
            role="tab"
            aria-selected={mode === key}
            key={key}
            onClick={() => {
              setMode(key);
              setError("");
            }}
          >
            <Icon size={15} />
            {t(label)}
          </button>
        ))}
      </div>
      <ErrorNotice
        error={error || share.error || receipts.error}
      />
      {mode === "link" && (
        <section>
          <p>
            {t(
              "Clients can open this link without signing in. It includes this recommendation and only the CVs listed below.",
            )}
          </p>
          {active ? (
            <>
              <Field label={t("Share link")}>
                <input
                  readOnly
                  value={
                    typeof window !== "undefined"
                      ? new URL(active.path, window.location.origin).href
                      : active.path
                  }
                />
              </Field>
              <p className="ws-muted">
                {t("Link expires")}:{" "}
                {new Date(active.expires_at).toLocaleDateString()}
              </p>
              <div className="ws-actions">
                <button
                  className="ws-button"
                  onClick={() =>
                    void copy(
                      new URL(active.path, window.location.origin).href,
                      "link",
                    )
                  }
                >
                  <Copy size={14} />
                  {t(copied === "link" ? "Copied" : "Copy link")}
                </button>
                <a
                  className="ws-button"
                  href={active.path}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("Open client link")}
                  <ExternalLink size={14} />
                </a>
                <button
                  className="ws-link"
                  disabled={busy}
                  onClick={() => void revoke()}
                >
                  {t("Revoke link")}
                </button>
              </div>
              {active.version !== document.version && (
                <div className="ws-notice mt-4">
                  <p>
                    {t(
                      "Your draft has changed. The existing link still shows the previously shared copy.",
                    )}
                  </p>
                  <button
                    className="ws-button"
                    disabled={busy}
                    onClick={() => void publish()}
                  >
                    {t("Publish latest copy and replace old link")}
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              className="ws-button ws-button-primary"
              disabled={busy || share.loading}
              onClick={() => void publish()}
            >
              {t(busy ? "Creating link…" : "Create client link")}
            </button>
          )}
        </section>
      )}
      {mode === "copy" && (
        <section>
          <p>
            {t(
              "Copy the subject and body into your email app, then attach the selected CVs below.",
            )}
          </p>
          <Field label={t("Email subject")}>
            <input readOnly value={document.title} />
          </Field>
          <button
            className="ws-button"
            onClick={() => void copy(document.title, "subject")}
          >
            {copied === "subject" ? <Check size={14} /> : <Copy size={14} />}{" "}
            {t(copied === "subject" ? "Subject copied" : "Copy subject")}
          </button>
          <Field label={t("Email body")}>
            <textarea readOnly rows={9} value={document.content} />
          </Field>
          <button
            className="ws-button"
            onClick={() => void copy(document.content, "body")}
          >
            {copied === "body" ? <Check size={14} /> : <Copy size={14} />}{" "}
            {t(copied === "body" ? "Body copied" : "Copy body")}
          </button>
        </section>
      )}
      {mode === "gmail" && (
        <section>
          <Link className="ws-button ws-button-primary" href={`/app?document=${document.id}&role=${document.role_id}&prompt=${encodeURIComponent("Help me email this saved recommendation to the client.")}`}>{t("Ask your AI assistant")}</Link>
          {receipts.data?.receipts.map((r) => (
            <p className="ws-muted mt-3" key={r.id}>
              {r.recipient} ·{" "}
              {t(
                r.status === "sent"
                  ? "Sent through Gmail"
                  : r.status === "sending"
                    ? "Sending through Gmail…"
                    : r.status === "failed"
                      ? "Sending failed"
                      : "Delivery unconfirmed",
              )}
              {r.error && <> — {t(r.error)}</>}
            </p>
          ))}
        </section>
      )}
      <section className="ws-delivery-files">
        <h3>{t("Selected CV attachments")}</h3>
        {source.files?.length ? (
          source.files.map((file) => (
            <a
              key={file.id}
              href={`/api/workspace/files/${file.id}`}
              className="ws-link"
            >
              {source.people?.find((p) => p.id === file.person_id)?.name} ·{" "}
              {file.name}
              <ExternalLink size={13} />
            </a>
          ))
        ) : (
          <p className="ws-muted">
            {t(
              "No CV attachments selected. Only the recommendation text will be shared.",
            )}
          </p>
        )}
      </section>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Copy,
  Link as LinkIcon,
  Mail,
  Check,
  ExternalLink,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useT } from "@/components/LanguageProvider";
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
  onSent,
}: {
  document: Deliverable;
  disabled: boolean;
  onSent: () => void;
}) {
  const t = useT();
  const params = useSearchParams();
  const router = useRouter();
  const oauthError = params.get("error");
  const returnedFromGmail = params.get("delivery") === "gmail" ||
    oauthError === "state_mismatch";
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="ws-button ws-button-primary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Mail size={14} />
        {t("Deliver to client")}
      </button>
      {(open || returnedFromGmail) && (
        <Dialog title={t("Deliver to client")} onClose={() => {
          setOpen(false);
          if (returnedFromGmail) {
            const next = new URL(window.location.href);
            next.searchParams.delete("delivery");
            next.searchParams.delete("error");
            router.replace(`${next.pathname}${next.search}${next.hash}`, { scroll: false });
          }
        }}>
          <DeliveryOptions document={document} onSent={onSent}
            returnedFromGmail={returnedFromGmail} oauthError={oauthError} />
        </Dialog>
      )}
    </>
  );
}
function DeliveryOptions({
  document,
  onSent,
  returnedFromGmail,
  oauthError,
}: {
  document: Deliverable;
  onSent: () => void;
  returnedFromGmail: boolean;
  oauthError: string | null;
}) {
  const t = useT();
  const [mode, setMode] = useState<"link" | "copy" | "gmail">(returnedFromGmail ? "gmail" : "link"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(""),
    [to, setTo] = useState("");
  const share = useQuery<{ share: Share | null }>(
    `/deliverables/${document.id}/share`,
  );
  const gmail = useQuery<{ connected: boolean; email: string | null }>(
    "/gmail",
  );
  const receipts = useQuery<{ receipts: Receipt[] }>(
    `/deliverables/${document.id}/email`,
  );
  const request = useRef<{
    recipient: string;
    version: number;
    key: string;
  } | null>(null);
  const source = document.source_snapshot as {
    files?: SubmissionCv[];
    people?: Array<{ id: string; name: string }>;
  };
  const active = share.data?.share;
  const delivery = receipts.data?.receipts.find(
    (r) =>
      r.recipient.toLowerCase() === to.trim().toLowerCase() &&
      r.current_copy &&
      r.status !== "failed",
  );
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
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.linkSocial({
        provider: "google",
        scopes: ["https://www.googleapis.com/auth/gmail.send"],
        disableRedirect: true,
        callbackURL: `${window.location.pathname}?delivery=gmail`,
        errorCallbackURL: `${window.location.pathname}?delivery=gmail`,
      });
      if (result.error) throw new Error(result.error.message);
      if (result.data?.url) {
        const url = new URL(result.data.url);
        url.searchParams.set("prompt", "consent");
        window.location.assign(url.href);
      } else throw new Error("Could not connect Gmail");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect Gmail");
      setBusy(false);
    }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const recipient = to.trim();
    if (
      request.current?.recipient !== recipient ||
      request.current.version !== document.version
    )
      request.current = {
        recipient,
        version: document.version,
        key: crypto.randomUUID(),
      };
    try {
      const result = await api<{ status: string }>(
        `/deliverables/${document.id}/email`,
        {
          method: "POST",
          body: JSON.stringify({
            to: recipient,
            expected_version: document.version,
            request_key: request.current.key,
          }),
        },
      );
      receipts.refresh();
      if (result.status === "sent") onSent();
      if (result.status === "failed") request.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send email");
      receipts.refresh();
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
        error={error || share.error || gmail.error || receipts.error}
      />
      {mode === "gmail" && returnedFromGmail && oauthError && !gmail.data?.connected && (
        <ErrorNotice error={t(oauthError === "state_mismatch"
          ? "Google could not verify this connection request. It may have expired or been replaced by another request. Click Connect Gmail to start again, and complete the Google screens within 5 minutes."
          : "Google did not complete the Gmail connection. Click Connect Gmail to try again and allow sending permission.")} />
      )}
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
          {!gmail.data?.connected ? (
            <>
              <p>
                {t(
                  "Connect your Google account to send this reviewed recommendation through Gmail. Hirelix requests sending permission, not inbox access.",
                )}
              </p>
              <a className="ws-link" href="/privacy" target="_blank" rel="noreferrer">
                {t("Gmail data use and privacy")}
              </a>
              <button
                className="ws-button ws-button-primary"
                disabled={busy || gmail.loading}
                onClick={() => void connect()}
              >
                {t("Connect Gmail")}
              </button>
            </>
          ) : (
            <form className="ws-form" onSubmit={send}>
              <p>
                {t("Sender email")}: {gmail.data.email}
              </p>
              <Field label={t("Recipient email")}>
                <input
                  type="email"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  disabled={busy}
                  placeholder="client@example.com"
                />
              </Field>
              <Field label={t("Email subject")}>
                <input readOnly value={document.title} />
              </Field>
              <Field label={t("Email body")}>
                <textarea readOnly rows={8} value={document.content} />
              </Field>
              <p>
                {t(
                  "The selected CVs below will be attached. This sends a real email to the recipient above.",
                )}
              </p>
              {delivery && (
                <p role="status">
                  {t(
                    delivery.status === "sent"
                      ? "Sent through Gmail"
                      : delivery.status === "sending"
                        ? "Sending through Gmail…"
                        : "Gmail did not confirm delivery. Check Sent in Gmail before trying again.",
                  )}
                </p>
              )}
              <button
                type="submit"
                className="ws-button ws-button-primary"
                disabled={busy || !!delivery}
              >
                {t(busy ? "Sending through Gmail…" : "Send email")}
              </button>
              <button
                type="button"
                className="ws-link"
                disabled={busy}
                onClick={async () => {
                  try {
                    await api("/gmail", { method: "DELETE" });
                    gmail.refresh();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not disconnect Gmail",
                    );
                  }
                }}
              >
                {t("Disconnect Gmail")}
              </button>
            </form>
          )}
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

"use client";

import { downloadDocument } from "./document-download";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
} from "lucide-react";
import {
  api,
  useQuery,
  ErrorNotice,
  Loading,
  Field,
  Dialog,
  date,
} from "./client";
import { RecommendationDelivery } from "./recommendation-delivery";
import { RevisionPanel } from "./revision";
import { History } from "./history";
import { AgentText } from "@/components/AgentText";
import type {
  Deliverable,
} from "@/lib/workspace/types";
import type { SubmissionCv } from "@/lib/workspace/deliverables";
import { useLanguage, useT } from "@/components/LanguageProvider";
import type { Locale } from "@/lib/locale";

export function DocumentPage({ id }: { id: string }) {
  const query = useQuery<{ deliverable: Deliverable }>(`/deliverables/${id}`);
  if (!query.data)
    return (
      <div className="ws-page">
        <ErrorNotice error={query.error} retry={query.refresh} />
        {query.loading && <Loading />}
      </div>
    );
  return <DocumentEditor key={id} initial={query.data.deliverable} />;
}
function DocumentEditor({ initial }: { initial: Deliverable }) {
  const t = useT();
  const { locale } = useLanguage();
  const [document, setDocument] = useState(initial),
    [title, setTitle] = useState(initial.title),
    [content, setContent] = useState(initial.content),
    [preview, setPreview] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState(false),
    [submit, setSubmit] = useState(false),
    [draftHydrated, setDraftHydrated] = useState(false),
    [recovery, setRecovery] = useState<{
      title: string;
      content: string;
    } | null>(null),
    [copied, setCopied] = useState<"subject" | "body" | "document" | null>(
      null,
    );
  const inflight = useRef(false),
    titleField = useRef<HTMLTextAreaElement>(null),
    dirty = title !== document.title || content !== document.content,
    readOnly = document.status === "submitted";
  const draftKey = `hirelix:deliverable:draft:${document.id}`;
  useEffect(() => {
    if (readOnly) {
      localStorage.removeItem(draftKey);
      setDraftHydrated(true);
      return;
    }
    try {
      const stored = JSON.parse(localStorage.getItem(draftKey) || "null") as {
        version?: number;
        title?: string;
        content?: string;
      } | null;
      if (stored && typeof stored.title === "string" && typeof stored.content === "string") {
        if (stored.title === initial.title && stored.content === initial.content)
          localStorage.removeItem(draftKey);
        else if (stored.version === initial.version) {
          setTitle(stored.title);
          setContent(stored.content);
        } else setRecovery({ title: stored.title, content: stored.content });
      }
    } catch {
      localStorage.removeItem(draftKey);
    }
    setDraftHydrated(true);
  }, [draftKey, initial.title, initial.content, initial.version, readOnly]);
  useEffect(() => {
    if (!draftHydrated || readOnly || recovery) return;
    if (dirty)
      localStorage.setItem(
        draftKey,
        JSON.stringify({ version: document.version, title, content }),
      );
    else localStorage.removeItem(draftKey);
  }, [draftHydrated, readOnly, recovery, dirty, draftKey, document.version, title, content]);
  useEffect(() => {
    const field = titleField.current;
    if (!field) return;
    const fitTitle = () => {
      field.style.height = "auto";
      field.style.height = `${Math.min(field.scrollHeight, 180)}px`;
    };
    fitTitle();
    let lastWidth = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === lastWidth) return;
      lastWidth = entry.contentRect.width;
      fitTitle();
    });
    observer.observe(field.parentElement || field);
    window.addEventListener("resize", fitTitle);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fitTitle);
    };
  }, [title, preview, readOnly, recovery]);
  const save = useCallback(async () => {
    if (inflight.current || readOnly || !dirty) return;
    inflight.current = true;
    setSaving(true);
    try {
      const result = await api<{ deliverable: Deliverable }>(
        `/deliverables/${document.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title,
            content,
            expected_version: document.version,
          }),
        },
      );
      setDocument(result.deliverable);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save your draft",
      );
    } finally {
      inflight.current = false;
      setSaving(false);
    }
  }, [title, content, document.id, document.version, dirty, readOnly]);
  useEffect(() => {
    if (!draftHydrated || recovery || !dirty || saving || error || readOnly) return;
    const timer = setTimeout(() => {
      void save();
    }, 1200);
    return () => clearTimeout(timer);
  }, [draftHydrated, recovery, dirty, saving, error, readOnly, save]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function download(format: "pdf" | "docx") {
    try {
      await downloadDocument(document, format);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export");
    }
  }
  async function copyText(
    value: string,
    part: "subject" | "body" | "document",
  ) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(part);
    } catch {
      setError("Could not access the clipboard. Select and copy the text.");
    }
  }
  const source = document.source_snapshot as {
    role?: { title: string; client_name: string; version: number };
    people?: Array<{ id: string; name: string; sharing_permission?: string }>;
    records?: Array<{ id: string; title: string; person_id: string | null }>;
    files?: SubmissionCv[];
    captured_at?: string;
    language?: Locale;
    audience?: "client" | "internal";
  };
  const internalReview = source.audience === "internal";
  return (
    <div className="ws-page">
      <header className="ws-page-header">
        <div>
          <Link
            className="ws-link mb-4"
            href={
              document.kind === "search_update"
                ? `/app/roles/${document.role_id}`
                : "/app/submissions"
            }
          >
            <ArrowLeft size={14} />
            {document.kind === "search_update"
              ? t("Back to role")
              : t("Candidate submissions")}
          </Link>
          <h1>
            {internalReview
              ? t("Internal review")
              : document.kind === "search_update"
              ? t("Search update")
              : t("Candidate submission")}
          </h1>
          <p>
            {source.role?.client_name} · {source.role?.title}
          </p>
        </div>
        <div className="ws-actions">
          <span className="ws-muted text-xs" role="status">
            {readOnly
              ? t("Submitted copy")
              : saving
                ? t("Saving…")
                : error
                  ? t("Not saved")
                  : dirty
                    ? t("Unsaved changes")
                    : t("Saved")}
          </span>
          {(["pdf", "docx"] as const).map((format) => (
            <button
              key={format}
              className="ws-button"
              disabled={dirty || saving}
              onClick={() => void download(format)}
            >
              {t("Export")} {format.toUpperCase()}
            </button>
          ))}
          {!readOnly && (
            <button className="ws-button" onClick={() => setPreview((p) => !p)}>
              {preview ? t("Edit draft") : internalReview ? t("Document preview") : t("Client preview")}
            </button>
          )}
          {document.kind === "submission" && !internalReview ? (
            <RecommendationDelivery document={document} disabled={dirty || saving || !!recovery} onSent={() => { void api<{ deliverable: Deliverable }>(`/deliverables/${document.id}`).then(result => setDocument(result.deliverable)); }} />
          ) : document.kind === "submission" ? (
            <>
              <button
                className="ws-button"
                onClick={() => void copyText(title, "subject")}
              >
                {copied === "subject" ? (
                  <Check size={14} />
                ) : (
                  <Copy size={14} />
                )}
                {internalReview
                  ? copied === "subject" ? t("Title copied") : t("Copy title")
                  : copied === "subject" ? t("Subject copied") : t("Copy subject")}
              </button>
              <button
                className="ws-button"
                onClick={() => void copyText(content, "body")}
              >
                {copied === "body" ? <Check size={14} /> : <Copy size={14} />}
                {copied === "body" ? t("Body copied") : t("Copy body")}
              </button>
            </>
          ) : (
            <button
              className="ws-button"
              onClick={() =>
                void copyText(`${title}\n\n${content}`, "document")
              }
            >
              {copied === "document" ? <Check size={14} /> : <Copy size={14} />}
              {copied === "document" ? t("Copied") : t("Copy text")}
            </button>
          )}
        </div>
      </header>
      <ErrorNotice
        error={error}
        retry={dirty ? () => void save() : undefined}
      />
      {recovery && (
        <div className="ws-document-recovery" role="status">
          <span>{t("You have unsaved edits from a previous visit.")}</span>
          <button
            type="button"
            onClick={() => {
              setTitle(recovery.title);
              setContent(recovery.content);
              setRecovery(null);
            }}
          >
            {t("Restore edits")}
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(draftKey);
              setRecovery(null);
            }}
          >
            {t("Discard edits")}
          </button>
        </div>
      )}
      <div className="ws-document-layout">
        <article className="ws-paper">
          {preview || readOnly || recovery ? (
            <>
              <p className="ws-paper-client">{source.role?.client_name}</p>
              <h2>{title}</h2>
              <AgentText content={content} />
            </>
          ) : (
            <>
              <label className="ws-editor-title">
                <span className="sr-only">{t("Document title")}</span>
                <textarea
                  ref={titleField}
                  aria-label={t("Document title")}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setCopied(null);
                  }}
                  onBlur={() => void save()}
                  maxLength={500}
                  rows={2}
                />
              </label>
              <textarea
                className="ws-document-text"
                aria-label={t("Document content")}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setCopied(null);
                }}
                onBlur={() => void save()}
                maxLength={100000}
                spellCheck
              />
            </>
          )}
        </article>
        <aside className="ws-document-side">
          {!readOnly && (
            <RevisionPanel
              document={document}
              disabled={dirty || saving || !!error}
              onApplied={(value) => {
                setDocument(value);
                setTitle(value.title);
                setContent(value.content);
                setCopied(null);
                setError("");
              }}
            />
          )}
          <section className="ws-section">
            <h3>{readOnly ? t("Delivery recorded") : t("Ready for your review")}</h3>
            <p>
              {readOnly
                ? `${date(document.submitted_at)}\n${document.submission_note}`
                : internalReview
                  ? t("For internal review. Use the assistant to prepare client material before recording a client submission. Unknown facts and sharing permission still need confirmation.")
                  : t("Check wording, facts and permission before you share. Copying this draft does not mark it submitted.")}
            </p>
            {!readOnly && !internalReview && (
              <button
                className="ws-button mt-4"
                disabled={dirty || saving}
                onClick={() => setSubmit(true)}
              >
                {t("Record actual submission")}
              </button>
            )}
          </section>
          <section className="ws-section">
            {document.kind === "submission" && (
              <>
                <h3>{t("CV attachments")}</h3>
                <p className="ws-muted">
                  {t("Only the files listed here were selected for this submission. Review and download each before sharing. PDF and DOCX exports contain the written recommendation only.")}
                </p>
                {source.people?.map((person) => {
                  const file = source.files?.find(
                    (item) => item.person_id === person.id,
                  );
                  return (
                    <div className="ws-attachment-person" key={person.id}>
                      <strong>{person.name}</strong>
                      {file ? (
                        <a
                          className="ws-detail-link"
                          href={`/api/workspace/files/${file.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {file.name} <ArrowUpRight size={12} />
                        </a>
                      ) : (
                        <p className="ws-muted">
                          {t("No CV selected for this person.")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </section>
          <section className="ws-section">
            <h3>{t("Draft language")}</h3>
            <p>{source.language === "zh" ? "中文" : t("English")}</p>
          </section>
          <section className="ws-section">
            <h3>{t("Source material")}</h3>
            {source.people
              ?.filter((person) => person.sharing_permission !== "confirmed")
              .map((person) => (
                <p key={person.id} className="ws-muted">
                  {locale === "zh"
                    ? `${person.name}：本草稿中该候选人的资料分享权限${person.sharing_permission === "declined" ? "已被拒绝" : "尚未确认"}。`
                    : `${person.name}: sharing permission ${person.sharing_permission === "declined" ? "declined" : "not confirmed"} in this draft’s sources.`}
                </p>
              ))}
            <p className="ws-muted">
              {t("Saved with this draft · Role version")} {source.role?.version}
            </p>
            {source.people?.map((person) => (
              <Link
                className="ws-detail-link"
                key={person.id}
                href={`/app/candidates?person=${person.id}`}
              >
                {person.name}
                <ArrowUpRight size={12} />
              </Link>
            ))}
            {source.records?.map((record) => (
              <Link
                className="ws-detail-link"
                key={record.id}
                href={
                  record.person_id
                    ? `/app/candidates?person=${record.person_id}&record=${record.id}`
                    : `/app/roles/${document.role_id}?tab=activity&record=${record.id}`
                }
              >
                {record.title}
                <ArrowUpRight size={12} />
              </Link>
            ))}
            {!source.records?.length && (
              <p className="ws-muted mt-2">{t("No private notes selected.")}</p>
            )}
          </section>
          <section className="ws-section">
            <h3>{t("Document history")}</h3>
            <button className="ws-link" onClick={() => setHistory(true)}>
              {t("View saved versions")}
            </button>
            {dirty || saving || recovery ? <p className="ws-muted mt-3">{t("Save your current edits before continuing in a new conversation.")}</p> : <Link
              className="ws-detail-link"
              href={`/app?document=${document.id}&role=${document.role_id}`}
            >
              {t("Continue in a new conversation")} <ArrowUpRight size={12} />
            </Link>}
          </section>
        </aside>
      </div>
      {history && (
        <History
          kind="deliverable"
          id={document.id}
          onClose={() => setHistory(false)}
        />
      )}
      {submit && (
        <RecordSubmission
          document={document}
          onClose={() => setSubmit(false)}
          onSaved={(value) => {
            setDocument(value);
            setSubmit(false);
            setPreview(true);
          }}
        />
      )}
    </div>
  );
}
function RecordSubmission({
  document,
  onClose,
  onSaved,
}: {
  document: Deliverable;
  onClose: () => void;
  onSaved: (document: Deliverable) => void;
}) {
  const t = useT();
  const [when, setWhen] = useState(() => {
      const d = new Date();
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await api<{ deliverable: Deliverable }>(
        `/deliverables/${document.id}/submitted`,
        {
          method: "POST",
          body: JSON.stringify({
            expected_version: document.version,
            submitted_at: new Date(when).toISOString(),
            submission_note: note,
          }),
        },
      );
      onSaved(result.deliverable);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not record submission",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      title={t("Record an actual submission")}
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form className="ws-form" onSubmit={save}>
        <p className="text-sm leading-7">
          {t("Use this after you have shared the document with your client. Hirelix will preserve this copy and add the delivery to the role’s activity.")}
        </p>
        <ErrorNotice error={error} />
        <Field label={t("When you shared it")}>
          <input
            type="datetime-local"
            required
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </Field>
        <Field label={t("Who received it and how")}>
          <textarea
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("Recipient, channel, and any relevant context")}
          />
        </Field>
        <div className="ws-form-footer">
          <button
            type="button"
            className="ws-button"
            disabled={saving}
            onClick={onClose}
          >
            {t("Cancel")}
          </button>
          <button className="ws-button ws-button-primary" disabled={saving}>
            {saving ? t("Saving…") : t("Record submission")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

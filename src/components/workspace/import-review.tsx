"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Upload,
  Check,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  api,
  Dialog,
  ErrorNotice,
  Field,
  Loading,
  useQuery,
} from "@/components/workspace/client";
import { PersonForm } from "@/components/workspace/forms";
import type {
  ImportRow,
  Job,
  Person,
  PersonInput,
} from "@/lib/workspace/types";
const fields = [
  "name",
  "headline",
  "location",
  "email",
  "phone",
  "profile_url",
  "skills",
  "note",
] as const;
type FieldName = (typeof fields)[number];
type Mapping = Record<FieldName, string[]>;
type Preview = {
  job: Job;
  items: ImportRow[];
  counts: Array<{ status: string; count: number }>;
  page: number;
  page_size: number;
};
const labels: Record<string, string> = {
  name: "Full name",
  headline: "Current role / headline",
  location: "Location",
  email: "Email",
  phone: "Phone",
  profile_url: "Profile URL",
  skills: "Expertise",
  note: "Private note",
  profile: "Professional background",
};
export function ImportCandidates() {
  const params = useSearchParams(),
    router = useRouter(),
    task = params.get("task");
  const [file, setFile] = useState<File | null>(null),
    [requestKey, setRequestKey] = useState(() => crypto.randomUUID()),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [review, setReview] = useState<ImportRow | null>(null),
    [saving, setSaving] = useState(false);
  const preview = useQuery<Preview>(
      task ? `/imports/${task}?page=${page}` : null,
    ),
    recent = useQuery<{ jobs: Job[] }>("/jobs");
  const result = preview.data?.job.result as
    | {
        format: string;
        headers?: string[];
        mapping?: Mapping;
        total: number;
        mapping_confirmed: boolean;
        warnings?: string[];
      }
    | undefined;
  useEffect(() => {
    if (
      !preview.data ||
      !["queued", "running"].includes(preview.data.job.status)
    )
      return;
    const timer = setInterval(preview.refresh, 1500);
    return () => clearInterval(timer);
  }, [preview.data, preview.refresh]);
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("request_key", requestKey);
      const result = await api<{ job: Job }>("/imports", {
        method: "POST",
        body: form,
      });
      router.push(`/app/candidates/import?task=${result.job.id}`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not upload file",
      );
    } finally {
      setUploading(false);
    }
  }
  async function skip(row: ImportRow) {
    setSaving(true);
    try {
      await api(`/imports/${task}/rows/${row.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "skip" }),
      });
      preview.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save your choice",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="ws-page">
      <header className="ws-page-header">
        <div>
          <Link className="ws-link mb-4" href="/app/candidates">
            <ArrowLeft size={13} />
            Candidates
          </Link>
          <h1>Import candidates</h1>
          <p>
            Review the fields and possible duplicates before saving to your
            candidate pool.
          </p>
        </div>
        {task && (
          <Link className="ws-button" href="/app/candidates/import">
            Upload another file
          </Link>
        )}
      </header>
      <ErrorNotice error={error || preview.error} retry={preview.refresh} />
      {!task ? (
        <div className="ws-import-upload">
          <form className="ws-form !p-0" onSubmit={upload}>
            <div className="ws-upload-zone">
              <Upload size={22} className="ws-muted" />
              <h2>Bring your existing candidates.</h2>
              <p>CSV, text PDF or DOCX · Up to 4 MB per file</p>
              <input
                aria-label="Candidate file"
                type="file"
                accept=".csv,.pdf,.docx"
                onChange={(event) => {
                  setFile(event.target.files?.[0] || null);
                  setRequestKey(crypto.randomUUID());
                  setError("");
                }}
              />
              <small>
                Original files are retained with the imported records. Scanned
                PDF images need a text version.
              </small>
            </div>
            <button
              className="ws-button ws-button-primary self-start"
              disabled={!file || uploading}
            >
              {uploading ? "Uploading…" : "Upload & preview"}
            </button>
          </form>
          <section className="ws-section mt-8">
            <h3>Recent imports</h3>
            {recent.data?.jobs.filter((job) => job.kind === "import").length ? (
              recent.data.jobs
                .filter((job) => job.kind === "import")
                .slice(0, 10)
                .map((job) => (
                  <Link
                    className="ws-detail-link"
                    key={job.id}
                    href={`/app/candidates/import?task=${job.id}`}
                  >
                    <strong>
                      {String(job.result?.filename || "Candidate import")}
                    </strong>
                    <small>
                      {job.status} · {job.progress}
                    </small>
                  </Link>
                ))
            ) : (
              <p className="ws-muted">
                Your imports will appear here so you can resume a review.
              </p>
            )}
          </section>
        </div>
      ) : !preview.data ? (
        <Loading>Opening import…</Loading>
      ) : preview.data.job.status === "error" ? (
        <div className="px-8">
          <ErrorNotice
            error={preview.data.job.error || "This import could not finish"}
            retry={() =>
              void api(`/jobs/${task}`, { method: "POST" })
                .then(preview.refresh)
                .catch((error) => setError(error.message))
            }
          />
          <p className="ws-muted text-sm mt-4">
            The original file has been saved. Retry the same task to continue
            without creating another import.
          </p>
        </div>
      ) : ["queued", "running"].includes(preview.data.job.status) ? (
        <div className="px-8">
          <Loading>{preview.data.job.progress}</Loading>
          <p className="ws-muted text-sm">
            You can leave this page. This import and its original file will
            remain available in Tasks.
          </p>
          <Link className="ws-link mt-4" href="/app/tasks">
            View tasks <ArrowUpRight size={13} />
          </Link>
        </div>
      ) : (
        <>
          <div className="ws-import-summary">
            <span>{result?.total || 0} rows</span>
            {preview.data.counts.map((item) => (
              <span className="ws-tag" key={item.status}>
                {item.count}{" "}
                {item.status === "review" ? "to review" : item.status}
              </span>
            ))}
            <a
              className="ws-link ml-auto"
              href={`/api/workspace/files/${String(preview.data.job.payload.file_id)}`}
            >
              Download original
            </a>
          </div>
          {result?.warnings?.length ? (
            <div className="ws-warning mx-8 mb-5">
              {result.warnings.join(" ")}
            </div>
          ) : null}
          {result?.format === "csv" &&
            !result.mapping_confirmed &&
            result.mapping &&
            result.headers && (
              <ColumnMapping
                initial={result.mapping}
                headers={result.headers}
                examples={preview.data.items.slice(0, 3)}
                onConfirm={async (mapping) => {
                  await api(`/imports/${task}`, {
                    method: "PATCH",
                    body: JSON.stringify(mapping),
                  });
                  preview.refresh();
                }}
              />
            )}
          <div className="ws-import-table">
            <div className="ws-import-row ws-table-head">
              <span>Candidate</span>
              <span>Possible duplicate</span>
              <span>Review</span>
            </div>
            {preview.data.items.map((item) => (
              <div className="ws-import-row" key={item.id}>
                <div>
                  <strong>{item.extracted.name || "Name needs review"}</strong>
                  <small>
                    {item.extracted.headline ||
                      item.extracted.email ||
                      `Row ${item.row_number}`}
                  </small>
                </div>
                <div>
                  {item.matches.length ? (
                    item.matches.map((match) => (
                      <p key={match.id}>
                        <span>{match.name}</span>
                        <small>{match.reason}</small>
                      </p>
                    ))
                  ) : (
                    <small>No exact identity match found</small>
                  )}
                </div>
                <div className="ws-actions">
                  {item.status === "saved" ? (
                    <Link
                      className="ws-link"
                      href={`/app/candidates?person=${item.result_person_id}`}
                    >
                      <Check size={14} />
                      Saved
                    </Link>
                  ) : item.status === "skipped" ? (
                    <span className="ws-muted">Skipped</span>
                  ) : (
                    <>
                      <button
                        className="ws-button"
                        disabled={!result?.mapping_confirmed || saving}
                        onClick={() => setReview(item)}
                      >
                        Review
                      </button>
                      <button
                        className="ws-link"
                        disabled={!result?.mapping_confirmed || saving}
                        onClick={() => skip(item)}
                      >
                        Skip
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            <div className="ws-pagination">
              <button
                className="ws-icon"
                aria-label="Previous import page"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                Page {page} of{" "}
                {Math.max(1, Math.ceil((result?.total || 0) / 50))}
              </span>
              <button
                className="ws-icon"
                aria-label="Next import page"
                disabled={page * 50 >= (result?.total || 0)}
                onClick={() => setPage((value) => value + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
      {review && task && (
        <ReviewRow
          key={review.id}
          row={review}
          jobId={task}
          onClose={() => setReview(null)}
          onSaved={() => {
            setReview(null);
            preview.refresh();
          }}
        />
      )}
    </div>
  );
}
function ColumnMapping({
  initial,
  headers,
  examples,
  onConfirm,
}: {
  initial: Mapping;
  headers: string[];
  examples: ImportRow[];
  onConfirm: (mapping: Mapping) => Promise<void>;
}) {
  const [mapping, setMapping] = useState(initial),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onConfirm(mapping);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not confirm mapping",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="ws-mapping" onSubmit={save}>
      <h2>Confirm column mapping</h2>
      <p className="ws-muted text-xs mb-5">
        Check the suggested mapping. For names, you can combine first and last
        name columns.
      </p>
      <ErrorNotice error={error} />
      <div className="ws-fields">
        {fields.map((field) => (
          <Field key={field} label={labels[field]}>
            <select
              multiple={field === "name"}
              value={
                field === "name" ? mapping[field] : mapping[field][0] || ""
              }
              onChange={(event) =>
                setMapping((current) => ({
                  ...current,
                  [field]: Array.from(event.target.selectedOptions)
                    .map((option) => option.value)
                    .filter(Boolean),
                }))
              }
            >
              {field !== "name" && (
                <option value="">Do not import this field</option>
              )}
              {headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
            <small>
              {examples
                .slice(0, 2)
                .map((item) => {
                  const raw = JSON.parse(item.raw_text) as Record<
                    string,
                    string
                  >;
                  return mapping[field]
                    .map((column) => raw[column])
                    .filter(Boolean)
                    .join(" ");
                })
                .filter(Boolean)
                .join(" / ") || "No sample value"}
            </small>
          </Field>
        ))}
      </div>
      <button
        className="ws-button ws-button-primary mt-5"
        disabled={saving || !mapping.name.length}
      >
        {saving ? "Preparing rows…" : "Confirm mapping"}
      </button>
    </form>
  );
}
function readable(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value))
    return value.map(readable).filter(Boolean).join("\n");
  if (typeof value === "object")
    return Object.entries(value)
      .map(([key, value]) => {
        const text = readable(value);
        return text
          ? `${labels[key] || key.replaceAll("_", " ")}: ${text}`
          : "";
      })
      .filter(Boolean)
      .join("\n");
  return String(value);
}
function ReviewRow({
  row,
  jobId,
  onClose,
  onSaved,
}: {
  row: ImportRow;
  jobId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<"add" | "merge">(
      row.matches.length ? "merge" : "add",
    ),
    [targetId, setTargetId] = useState(row.matches[0]?.id || ""),
    [choices, setChoices] = useState<Record<string, "current" | "incoming">>(
      {},
    ),
    [editing, setEditing] = useState(!row.matches.length);
  const target = useQuery<{ person: Person }>(
    action === "merge" && targetId ? `/people/${targetId}` : null,
  );
  const mergeFields = [...fields, "profile"] as const;
  const conflicts = mergeFields.filter((field) => {
    const current = readable(target.data?.person[field]),
      incoming = readable(row.extracted[field]);
    return !!current && !!incoming && current !== incoming;
  });
  const selected = Object.fromEntries(
    mergeFields.map((field) => {
      const incoming = row.extracted[field],
        current = target.data?.person[field];
      return [
        field,
        action === "merge"
          ? choices[field] === "current" || !readable(incoming)
            ? current
            : incoming
          : incoming,
      ];
    }),
  ) as Partial<PersonInput>;
  if (editing)
    return (
      <PersonForm
        initialValues={selected}
        title={
          action === "merge"
            ? "Review merged candidate"
            : "Review imported candidate"
        }
        onClose={() => setEditing(false)}
        onSaved={onSaved}
        saveOverride={async (fields) => {
          const response = await api<{ row: ImportRow }>(
            `/imports/${jobId}/rows/${row.id}`,
            {
              method: "POST",
              body: JSON.stringify({
                action,
                fields,
                ...(action === "merge"
                  ? {
                      target_person_id: targetId,
                      expected_version: target.data?.person.version,
                    }
                  : {}),
              }),
            },
          );
          const details = await api<{ person: Person }>(
            `/people/${response.row.result_person_id}`,
          );
          return details.person;
        }}
      />
    );
  return (
    <Dialog
      title={`Review ${row.extracted.name || `row ${row.row_number}`}`}
      onClose={onClose}
      wide
    >
      <div className="ws-form">
        <Field label="How should this record be saved?">
          <select
            value={action}
            onChange={(event) => {
              setAction(event.target.value as "add" | "merge");
              setChoices({});
            }}
          >
            <option value="add">Add as a new candidate</option>
            <option value="merge" disabled={!row.matches.length}>
              Merge into an existing match
            </option>
          </select>
        </Field>
        {row.matches.length > 0 && action === "add" && (
          <p className="ws-warning">
            A possible match exists. Add a separate candidate only if this is a
            different person.
          </p>
        )}
        {action === "merge" && (
          <>
            <Field label="Existing candidate">
              <select
                value={targetId}
                onChange={(event) => {
                  setTargetId(event.target.value);
                  setChoices({});
                }}
              >
                {row.matches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.name} · {match.reason}
                  </option>
                ))}
              </select>
            </Field>
            <ErrorNotice error={target.error} retry={target.refresh} />
            {target.loading ? (
              <Loading />
            ) : conflicts.length ? (
              <>
                <p className="ws-muted text-xs">
                  Choose a value for each difference. Previous versions and the
                  original imported file will remain available.
                </p>
                {conflicts.map((field) => (
                  <fieldset className="ws-conflict" key={field}>
                    <legend>{labels[field]}</legend>
                    <label>
                      <input
                        type="radio"
                        name={`resolution-${field}`}
                        checked={choices[field] === "current"}
                        onChange={() =>
                          setChoices((current) => ({
                            ...current,
                            [field]: "current",
                          }))
                        }
                      />
                      <span>
                        <strong>Keep existing</strong>
                        <small>{readable(target.data?.person[field])}</small>
                      </span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`resolution-${field}`}
                        checked={choices[field] === "incoming"}
                        onChange={() =>
                          setChoices((current) => ({
                            ...current,
                            [field]: "incoming",
                          }))
                        }
                      />
                      <span>
                        <strong>Use imported</strong>
                        <small>{readable(row.extracted[field])}</small>
                      </span>
                    </label>
                  </fieldset>
                ))}
              </>
            ) : (
              <p className="ws-muted text-sm">
                No conflicting populated fields. Imported source records will be
                retained.
              </p>
            )}
          </>
        )}
        <details>
          <summary className="ws-link">View original imported content</summary>
          <p className="whitespace-pre-wrap text-xs leading-6 mt-3">
            {row.raw_text}
          </p>
        </details>
        <div className="ws-form-footer">
          <button className="ws-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="ws-button ws-button-primary"
            disabled={
              action === "merge" &&
              (!target.data ||
                target.loading ||
                conflicts.some((field) => !choices[field]))
            }
            onClick={() => setEditing(true)}
          >
            Review fields
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** The same import review lives inside the assistant conversation. */
export function ConversationImport({ jobId }: { jobId: string }) {
  const [page, setPage] = useState(1),
    [review, setReview] = useState<ImportRow | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [expanded, setExpanded] = useState(false);
  const preview = useQuery<Preview>(`/imports/${jobId}?page=${page}`);
  const job = preview.data?.job,
    result = job?.result as
      | {
          format: string;
          headers?: string[];
          mapping?: Mapping;
          total: number;
          mapping_confirmed: boolean;
          warnings?: string[];
        }
      | undefined;
  const pending = !!job && ["queued", "running"].includes(job.status);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(preview.refresh, 1800);
    return () => clearInterval(timer);
  }, [pending, preview.refresh]);
  const saved =
      preview.data?.counts.find((c) => c.status === "saved")?.count || 0,
    remaining =
      preview.data?.counts
        .filter((c) => ["review", "error"].includes(c.status))
        .reduce((n, c) => n + c.count, 0) || 0;
  async function skip(row: ImportRow) {
    setSaving(true);
    setError("");
    try {
      await api(`/imports/${jobId}/rows/${row.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "skip" }),
      });
      preview.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save your choice",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="ws-chat-import"
      aria-label="Candidate import in conversation"
    >
      <div className="ws-message-label">Hirelix</div>
      <ErrorNotice error={error || preview.error} retry={preview.refresh} />
      {!job ? (
        <Loading>Opening your file…</Loading>
      ) : pending ? (
        <Loading>
          {job.progress === "Queued"
            ? "I have your file. I’ll read the candidates and check for duplicates."
            : job.progress}
        </Loading>
      ) : job.status === "error" ? (
        <>
          <p>I’ve kept your original file, but couldn’t finish reading it.</p>
          <ErrorNotice
            error={job.error || "This file needs another attempt"}
            retry={() =>
              void api(`/jobs/${jobId}`, { method: "POST" })
                .then(preview.refresh)
                .catch((cause) => setError(cause.message))
            }
          />
        </>
      ) : (
        <>
          <p>
            {remaining
              ? `I found ${result?.total || 0} candidate ${result?.total === 1 ? "record" : "records"}. ${saved ? `${saved} saved; ` : ""}${remaining} ${remaining === 1 ? "needs" : "need"} your review.`
              : `${saved} ${saved === 1 ? "candidate has" : "candidates have"} been saved to your pool. You can keep adding information in this conversation.`}
          </p>
          {result?.warnings?.length ? (
            <p className="ws-warning">{result.warnings.join(" ")}</p>
          ) : null}
          {result?.format === "csv" &&
          !result.mapping_confirmed &&
          result.mapping &&
          result.headers ? (
            <>
              <p className="ws-muted">
                I’ve matched the columns to candidate fields. Check the sample
                before I save anyone.
              </p>
              <button
                className="ws-button mt-3"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Hide column details" : "Review column mapping"}
              </button>
              {expanded && (
                <ColumnMapping
                  initial={result.mapping}
                  headers={result.headers}
                  examples={preview.data!.items.slice(0, 3)}
                  onConfirm={async (mapping) => {
                    await api(`/imports/${jobId}`, {
                      method: "PATCH",
                      body: JSON.stringify(mapping),
                    });
                    setExpanded(false);
                    preview.refresh();
                  }}
                />
              )}
            </>
          ) : (
            <div className="ws-chat-import-people">
              {preview.data?.items.map((item) => (
                <div className="ws-chat-import-person" key={item.id}>
                  <div>
                    <strong>
                      {item.extracted.name || `Candidate ${item.row_number}`}
                    </strong>
                    <small>
                      {item.extracted.headline ||
                        item.extracted.email ||
                        "Check the extracted profile"}
                    </small>
                    {item.status === "review" && item.matches.length > 0 && (
                      <small className="ws-duplicate-hint">
                        Already in your pool?{" "}
                        {item.matches.map((m) => m.name).join(", ")}. I’ll ask
                        which details to keep.
                      </small>
                    )}
                  </div>
                  <div className="ws-actions">
                    {item.status === "saved" ? (
                      <Link
                        className="ws-link"
                        href={`/app/candidates?person=${item.result_person_id}`}
                      >
                        <Check size={13} />
                        Open candidate
                      </Link>
                    ) : item.status === "skipped" ? (
                      <small>Skipped</small>
                    ) : (
                      <>
                        <button
                          className="ws-button"
                          disabled={saving}
                          onClick={() => setReview(item)}
                        >
                          {item.matches.length
                            ? "Review duplicate"
                            : "Review & save"}
                        </button>
                        <button
                          className="ws-link"
                          disabled={saving}
                          onClick={() => skip(item)}
                        >
                          Skip
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(result?.total || 0) > 50 && (
            <div className="ws-pagination">
              <button
                className="ws-button"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                {page} / {Math.ceil((result?.total || 0) / 50)}
              </span>
              <button
                className="ws-button"
                disabled={page * 50 >= (result?.total || 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      <a
        className="ws-import-original"
        href={
          job
            ? `/api/workspace/files/${String(job.payload.file_id)}`
            : undefined
        }
      >
        Original:{" "}
        {String(job?.payload.filename || result?.format || "candidate file")}
      </a>
      {review && (
        <ReviewRow
          key={review.id}
          row={review}
          jobId={jobId}
          onClose={() => setReview(null)}
          onSaved={() => {
            setReview(null);
            preview.refresh();
          }}
        />
      )}
    </section>
  );
}

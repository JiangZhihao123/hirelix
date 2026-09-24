"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X, Loader2 } from "lucide-react";
import { fetchWithUserSession } from "@/lib/client-auth";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetchWithUserSession(`/api/workspace${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok)
    throw new ApiError(
      payload.error || "Could not complete this request",
      response.status,
    );
  return payload as T;
}
export function useQuery<T>(path: string | null) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    path: string | null;
    revision: number;
    data: T | null;
    error: string;
  }>({ path: null, revision: -1, data: null, error: "" });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ path, revision, data, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult((previous) => ({
            path,
            revision,
            data: previous.path === path ? previous.data : null,
            error:
              error instanceof Error
                ? error.message
                : "Could not load this page",
          }));
      });
    return () => controller.abort();
  }, [path, revision]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return {
    data: result.path === path ? result.data : null,
    error:
      result.path === path && result.revision === revision ? result.error : "",
    loading: !!path && (result.path !== path || result.revision !== revision),
    refresh,
  };
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return error ? (
    <div className="ws-error" role="alert">
      <span>{error}</span>
      {retry && (
        <button type="button" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  ) : null;
}
export function Loading({ children = "Loading…" }: { children?: ReactNode }) {
  return (
    <div role="status" className="ws-loading">
      <Loader2 size={16} className="animate-spin" />
      {children}
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    element
      ?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select")
      ?.focus();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`ws-dialog ${wide ? "ws-dialog-wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="ws-icon"
          aria-label={`Close ${title}`}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="ws-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function date(value: string | null | undefined, withTime = false) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? "Not recorded"
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(withTime ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
      }).format(parsed);
}
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { ArrowRight, Loader2, FileText, Users } from "lucide-react";

export default function NewSearchPage() {
  const { session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jdText, setJdText] = useState("");

  useEffect(() => {
    const prefill = searchParams.get("jd");
    if (prefill) setJdText(prefill);
  }, [searchParams]);
  const [candidateCount, setCandidateCount] = useState(5);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!jdText.trim() || !session) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/search/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ jd_text: jdText.trim(), candidate_count: candidateCount }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create search");
      }

      const { id } = await res.json();
      router.push(`/app/search/${id}`);
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Something went wrong",
      );
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">New Search</h1>
        <p className="mt-1 text-sm text-muted">
          Paste a job description below. Hirelix will analyze the requirements
          and find matching candidates.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="rounded-xl border border-border bg-background p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
            <FileText className="h-4 w-4 text-primary" />
            Job Description
          </div>
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste the full job description here...&#10;&#10;For example:&#10;We're looking for a Senior Frontend Engineer with 5+ years of experience in React, TypeScript, and modern web technologies..."
            rows={16}
            className="w-full resize-none rounded-lg border border-border bg-surface p-4 text-sm leading-relaxed text-foreground placeholder:text-muted-light focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-light">
                {jdText.length > 0
                  ? `${jdText.split(/\s+/).filter(Boolean).length} words`
                  : "Tip: The more detailed the JD, the better the results."}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Users className="h-3 w-3" />
                {[5, 10, 15].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCandidateCount(n)}
                    className={`rounded-md cursor-pointer px-2 py-0.5 text-xs font-medium transition-colors ${
                      candidateCount === n
                        ? "bg-primary text-white"
                        : "bg-surface text-muted hover:bg-surface-dark"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <span className="text-muted-light">candidates</span>
              </div>
            </div>
            <button
              type="submit"
              disabled={status === "loading" || jdText.trim().length < 50}
              className="inline-flex items-center gap-2 cursor-pointer rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  Find Candidates <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {status === "error" && (
          <p className="mt-4 text-sm text-red-500">{errorMsg}</p>
        )}
      </form>
    </div>
  );
}

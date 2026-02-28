"use client";

import { useState, FormEvent } from "react";
import { ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong");
      }

      setStatus("success");
      setEmail("");
      // Fire Google Analytics conversion event
      if (typeof window !== "undefined" && "gtag" in window) {
        (window as unknown as { gtag: (...args: unknown[]) => void }).gtag("event", "sign_up", {
          event_category: "waitlist",
          event_label: "waitlist_submission",
        });
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "success") {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-7">
        <CheckCircle2 className="h-9 w-9 text-primary" />
        <p className="text-lg font-semibold">You&apos;re on the list!</p>
        <p className="text-sm text-muted">
          We&apos;ll send you an invite link when a spot opens up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-8 max-w-md">
      <div className="flex gap-2.5">
        <input
          type="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-light focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {status === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Request <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
      {status === "error" && (
        <p className="mt-3 text-sm text-red-500">{errorMsg}</p>
      )}
      <p className="mt-4 text-xs text-muted-light">
        No spam — just one email when your invite is ready.
      </p>
    </form>
  );
}

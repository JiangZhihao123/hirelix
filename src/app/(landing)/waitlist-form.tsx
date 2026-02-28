"use client";

import { useState, FormEvent } from "react";
import { ArrowRight, Loader2, CheckCircle2, Shield, Clock } from "lucide-react";

export function WaitlistForm({ compact }: { compact?: boolean }) {
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
      // Fire Google Analytics + Google Ads conversion events
      if (typeof window !== "undefined" && "gtag" in window) {
        const gtag = (window as unknown as { gtag: (...args: unknown[]) => void }).gtag;
        gtag("event", "sign_up", {
          event_category: "waitlist",
          event_label: "waitlist_submission",
        });
        gtag("event", "conversion", {
          send_to: "AW-16927084361/ZU0bCOvlyYAcEMmeu4c_",
        });
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "success") {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-7">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
          <CheckCircle2 className="h-6 w-6 text-emerald-400" />
        </div>
        <p className="text-lg font-semibold text-white">You&apos;re in! 🎉</p>
        <p className="text-sm text-gray-400">
          Check your inbox — we&apos;ll send your invite within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "mt-6" : "mt-8"}>
      <form onSubmit={handleSubmit} className="mx-auto max-w-md">
        <div className="flex gap-2">
          <input
            type="email"
            required
            placeholder="Enter your work email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-4 text-base text-white placeholder:text-gray-500 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-6 py-4 text-base font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-[0_0_24px_rgba(37,99,235,0.35)] disabled:opacity-50"
          >
            {status === "loading" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Get Early Access <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
        {status === "error" && (
          <p className="mt-3 text-sm text-red-400">{errorMsg}</p>
        )}
      </form>
      {!compact && (
        <div className="mx-auto mt-4 flex max-w-md items-center justify-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> No spam, ever</span>
          <span className="text-gray-700">·</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Takes 5 seconds</span>
          <span className="text-gray-700">·</span>
          <span>Free forever in beta</span>
        </div>
      )}
    </div>
  );
}

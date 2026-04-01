"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";

interface LinkedInScanAnimationProps {
  stage: "linkedin_scan" | "reviewing_profiles";
  roleTitle?: string;
}

const TARGET_COUNT = 1_200_000;
const RAMP_DURATION_MS = 8_000;
const TICK_MS = 50;

export function LinkedInScanAnimation({ stage, roleTitle }: LinkedInScanAnimationProps) {
  const [count, setCount] = useState(0);
  const [progressWidth, setProgressWidth] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const frozenCountRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isComplete = stage === "reviewing_profiles";

  useEffect(() => {
    if (isComplete) {
      // Freeze the counter — stop the interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (frozenCountRef.current === null) {
        frozenCountRef.current = TARGET_COUNT + Math.floor(Math.random() * 50_000);
        setCount(frozenCountRef.current);
      }
      setProgressWidth(82);
      return;
    }

    startTimeRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - (startTimeRef.current ?? Date.now());

      if (elapsed < RAMP_DURATION_MS) {
        // Exponential easing: fast start, slow approach to TARGET_COUNT
        const t = elapsed / RAMP_DURATION_MS;
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        const next = Math.floor(eased * TARGET_COUNT);
        setCount(next);
        setProgressWidth(Math.min(82, Math.floor(eased * 82)));
      } else {
        // After ramp: slowly tick up
        setCount((prev) => prev + Math.floor(Math.random() * 200 + 100));
        setProgressWidth(82);
      }
    }, TICK_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isComplete]);

  const displayCount = isComplete && frozenCountRef.current !== null
    ? frozenCountRef.current
    : count;

  return (
    <div className="mb-4 rounded-2xl border border-sky-900/40 bg-[#0d1b2e] p-5 shadow-[0_8px_32px_rgba(14,165,233,0.1)]">
      <div className="flex items-center gap-2">
        {isComplete ? (
          <CheckCircle2 className="h-4 w-4 text-sky-400" />
        ) : (
          <Search className="h-4 w-4 text-sky-500" />
        )}
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-500">
          {isComplete ? "LinkedIn scan complete" : "Scanning LinkedIn"}
        </p>
      </div>

      <div className="mt-4 text-center">
        <p className="text-5xl font-bold tabular-nums text-white">
          {displayCount.toLocaleString()}
          {isComplete ? "+" : ""}
        </p>
        <p className="mt-1.5 text-sm text-slate-400">profiles scanned</p>
      </div>

      <div className="mt-5">
        {isComplete ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-sky-800/40 bg-sky-950/40 px-4 py-2.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            <span className="text-sm font-medium text-sky-200">
              Now reviewing top candidates
            </span>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-sky-950/60">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-500 ease-out"
                style={{ width: `${progressWidth}%` }}
              />
            </div>
            <p className="text-right text-[10px] text-slate-500">scanning…</p>
          </div>
        )}
      </div>

      {roleTitle && (
        <p className="mt-3 truncate text-xs text-slate-500">
          Matching: {roleTitle}
        </p>
      )}
    </div>
  );
}

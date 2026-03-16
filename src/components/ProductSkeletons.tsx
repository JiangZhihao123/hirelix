"use client";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/80 ${className}`} />;
}

export function ProductShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
        <div className="flex h-14 items-center border-b border-border px-5">
          <SkeletonBlock className="h-6 w-28 rounded-lg" />
        </div>
        <div className="space-y-2 p-3">
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
        </div>
        <div className="mt-auto border-t border-border p-3">
          <SkeletonBlock className="mb-3 h-4 w-32 rounded-md" />
          <SkeletonBlock className="h-10 w-full" />
        </div>
      </aside>
      <div className="w-full flex-1 p-4 pt-18 sm:p-6 sm:pt-20 lg:p-8 lg:pl-[calc(15rem+2rem)] lg:pt-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <SkeletonBlock className="h-4 w-28 rounded-md" />
          <SkeletonBlock className="h-10 w-3/4" />
          <SkeletonBlock className="h-5 w-full max-w-2xl rounded-md" />
          <SkeletonBlock className="h-5 w-2/3 rounded-md" />
          <SkeletonBlock className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="w-full max-w-3xl space-y-3">
          <SkeletonBlock className="h-4 w-28 rounded-md" />
          <SkeletonBlock className="h-11 w-4/5" />
          <SkeletonBlock className="h-5 w-full max-w-2xl rounded-md" />
          <SkeletonBlock className="h-5 w-2/3 rounded-md" />
        </div>
        <SkeletonBlock className="h-12 w-52 rounded-xl" />
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-9 w-20 rounded-lg" />
          <SkeletonBlock className="h-9 w-24 rounded-lg" />
          <SkeletonBlock className="h-9 w-28 rounded-lg" />
        </div>
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="w-full space-y-3">
                <SkeletonBlock className="h-6 w-64 rounded-md" />
                <SkeletonBlock className="h-4 w-40 rounded-md" />
                <SkeletonBlock className="h-4 w-full rounded-md" />
              </div>
              <SkeletonBlock className="h-10 w-24 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NewShortlistSkeleton() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 space-y-3">
        <SkeletonBlock className="h-4 w-28 rounded-md" />
        <SkeletonBlock className="h-10 w-3/4" />
        <SkeletonBlock className="h-5 w-full max-w-2xl rounded-md" />
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <SkeletonBlock className="h-9 w-44 rounded-full" />
        <SkeletonBlock className="h-9 w-48 rounded-full" />
        <SkeletonBlock className="h-9 w-44 rounded-full" />
      </div>
      <div className="rounded-xl border border-border bg-background p-6">
        <SkeletonBlock className="mb-4 h-5 w-40 rounded-md" />
        <SkeletonBlock className="mb-4 h-4 w-2/3 rounded-md" />
        <SkeletonBlock className="h-72 w-full rounded-xl" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <SkeletonBlock className="h-4 w-28 rounded-md" />
          <SkeletonBlock className="h-11 w-44 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function ResultPageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 space-y-4">
        <SkeletonBlock className="h-4 w-28 rounded-md" />
        <SkeletonBlock className="h-9 w-3/4 rounded-md" />
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-7 w-24 rounded-md" />
          <SkeletonBlock className="h-7 w-28 rounded-md" />
          <SkeletonBlock className="h-7 w-20 rounded-md" />
        </div>
      </div>
      <div className="mb-6 rounded-2xl border border-sky-200 bg-white p-5">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-44 rounded-md" />
          <SkeletonBlock className="h-8 w-3/4 rounded-md" />
          <SkeletonBlock className="h-4 w-full rounded-md" />
          <SkeletonBlock className="h-4 w-2/3 rounded-md" />
        </div>
      </div>
      <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="space-y-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <SkeletonBlock className="h-7 w-7 rounded-full" />
              <SkeletonBlock className="h-4 w-56 rounded-md" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {[0, 1].map((item) => (
          <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="w-full space-y-3">
                <SkeletonBlock className="h-6 w-56 rounded-md" />
                <SkeletonBlock className="h-4 w-40 rounded-md" />
                <SkeletonBlock className="h-4 w-full rounded-md" />
              </div>
              <SkeletonBlock className="h-8 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 space-y-3">
        <SkeletonBlock className="h-4 w-20 rounded-md" />
        <SkeletonBlock className="h-10 w-2/3 rounded-md" />
        <SkeletonBlock className="h-5 w-full max-w-3xl rounded-md" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="space-y-2 border-l border-slate-200 pl-4">
            <SkeletonBlock className="h-14 w-full rounded-xl" />
            <SkeletonBlock className="h-14 w-full rounded-xl" />
            <SkeletonBlock className="h-14 w-full rounded-xl" />
          </div>
        </aside>
        <div className="space-y-6">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
              <div className="space-y-3">
                <SkeletonBlock className="h-4 w-20 rounded-md" />
                <SkeletonBlock className="h-8 w-56 rounded-md" />
                <SkeletonBlock className="h-4 w-full max-w-2xl rounded-md" />
              </div>
              <div className="mt-6 space-y-4">
                <SkeletonBlock className="h-24 w-full rounded-xl" />
                <SkeletonBlock className="h-24 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";

import { OpsDashboardClient } from "../[secret]/OpsDashboardClient";

export function CeoDashboardAccessClient() {
  const secret = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("hashchange", onStoreChange);
      return () => window.removeEventListener("hashchange", onStoreChange);
    },
    () => decodeURIComponent(window.location.hash.slice(1)).trim(),
    () => null,
  );

  if (secret !== null && (secret.length < 32 || secret.length > 256)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-slate-950">链接无效</h1>
          <p className="mt-2 text-sm text-slate-500">请使用完整的 CEO 运营看板专属链接。</p>
        </div>
      </main>
    );
  }

  if (!secret) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在打开运营看板...
      </main>
    );
  }

  return <OpsDashboardClient secret={secret} />;
}

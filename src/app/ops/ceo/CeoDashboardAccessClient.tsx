"use client";

import { useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";

import { ProductAnalyticsDashboard } from "./ProductAnalyticsDashboard";
import { OpsDashboardClient } from "../[secret]/OpsDashboardClient";

export function CeoDashboardAccessClient() {
  const [manualSecret, setManualSecret] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [legacy, setLegacy] = useState(false);
  const hashSecret = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("hashchange", onStoreChange);
      return () => window.removeEventListener("hashchange", onStoreChange);
    },
    () => {
      try {
        return decodeURIComponent(window.location.hash.slice(1)).trim();
      } catch {
        return "";
      }
    },
    () => null,
  );

  const secret = submitted || hashSecret;
  if (secret !== null && (secret.length === 0 || secret.length > 256)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-slate-950">流量与产品分析</h1>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(manualSecret.trim());
            }}
          >
            <input
              type="password"
              aria-label="访问凭据"
              placeholder="输入运营看板访问凭据"
              value={manualSecret}
              onChange={(e) => setManualSecret(e.target.value)}
              className="rounded border p-2"
            />
            <button className="rounded bg-emerald-800 px-4 text-white">
              打开看板
            </button>
          </form>
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

  return (
    <>
      <div className="flex justify-end gap-5 border-b bg-white px-6 py-2">
        <button
          className="text-sm text-slate-600"
          onClick={() => {
            setSubmitted("");
            setManualSecret("");
            window.location.hash = "";
          }}
        >
          切换访问凭据
        </button>
        <button
          className="text-sm text-slate-600"
          onClick={() => setLegacy((x) => !x)}
        >
          {legacy ? "流量与产品分析" : "历史运营看板"}
        </button>
      </div>
      {legacy ? (
        <OpsDashboardClient secret={secret} />
      ) : (
        <ProductAnalyticsDashboard secret={secret} />
      )}
    </>
  );
}

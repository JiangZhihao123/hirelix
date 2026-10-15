"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/AuthProvider";
import type { BillingSummary } from "@/lib/billing";
import { fetchWithUserSession } from "@/lib/client-auth";

type BillingResponse = {
  billing: BillingSummary;
};

type BillingContextValue = {
  billing: BillingSummary | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const BillingContext = createContext<BillingContextValue>({
  billing: null,
  loading: true,
  refresh: async () => {},
});

export function BillingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  const pending = useRef<{ userId: string; promise: Promise<void>; refreshAgain: boolean } | null>(null);
  const lastLoaded = useRef(0);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBilling = useCallback((force = false): Promise<void> => {
    if (!userId) return Promise.resolve();
    if (pending.current?.userId === userId) {
      if (force) pending.current.refreshAgain = true;
      return pending.current.promise;
    }
    if (!force && Date.now() - lastLoaded.current < 5000) return Promise.resolve();
    const promise = (async () => {
      do {
        if (pending.current?.userId === userId) pending.current.refreshAgain = false;
        const res = await fetchWithUserSession("/api/billing");
        if (!res.ok) throw new Error("Failed to fetch billing");
        const data = (await res.json()) as BillingResponse;
        if (currentUserId.current !== userId) return;
        setBilling(data.billing);
        lastLoaded.current = Date.now();
        // A payment/task event during the request still needs a fresh read.
      } while (pending.current?.userId === userId && pending.current.refreshAgain);
    })().finally(() => {
      if (pending.current?.promise === promise) pending.current = null;
    });
    pending.current = { userId, promise, refreshAgain: false };
    return promise;
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      lastLoaded.current = 0;
      setBilling(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    lastLoaded.current = 0;

    async function load() {
      setLoading(true);
      try {
        await fetchBilling();
      } catch {
        if (!cancelled) {
          setBilling(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    function handleRefresh() {
      if (document.visibilityState === "hidden") return;
      void fetchBilling().catch(() => {});
    }

    function handleBillingChange() {
      void fetchBilling(true).catch(() => {});
    }

    window.addEventListener("focus", handleRefresh);
    window.addEventListener("hirelix:billing-changed", handleBillingChange);
    document.addEventListener("visibilitychange", handleRefresh);
    const timer = window.setInterval(handleRefresh, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("hirelix:billing-changed", handleBillingChange);
      document.removeEventListener("visibilitychange", handleRefresh);
    };
  }, [fetchBilling, userId]);

  const refresh = useCallback(async () => {
    if (userId) await fetchBilling(true);
  }, [fetchBilling, userId]);
  const value = useMemo<BillingContextValue>(() => ({ billing, loading, refresh }), [billing, loading, refresh]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  return useContext(BillingContext);
}

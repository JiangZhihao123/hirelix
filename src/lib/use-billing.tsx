"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  const { session } = useAuth();
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBilling = useCallback(async () => {
    const res = await fetchWithUserSession("/api/billing");

    if (!res.ok) {
      throw new Error("Failed to fetch billing");
    }

    const data = (await res.json()) as BillingResponse;
    setBilling(data.billing);
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setBilling(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

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
      void load();
    }

    window.addEventListener("focus", handleRefresh);
    document.addEventListener("visibilitychange", handleRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleRefresh);
      document.removeEventListener("visibilitychange", handleRefresh);
    };
  }, [fetchBilling, session?.access_token]);

  const value = useMemo<BillingContextValue>(() => ({
    billing,
    loading,
    refresh: async () => {
      if (!session?.access_token) return;
      await fetchBilling();
    },
  }), [billing, fetchBilling, loading, session?.access_token]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  return useContext(BillingContext);
}

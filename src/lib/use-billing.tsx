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

  const fetchBilling = useCallback(async (accessToken: string) => {
    const res = await fetch("/api/billing", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      throw new Error("Failed to fetch billing");
    }

    const data = (await res.json()) as BillingResponse;
    setBilling(data.billing);
  }, []);

  useEffect(() => {
    const accessToken = session?.access_token;
    if (!accessToken) {
      setBilling(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/billing", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!res.ok) return;

        const data = (await res.json()) as BillingResponse;
        if (!cancelled) {
          setBilling(data.billing);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const value = useMemo<BillingContextValue>(() => ({
    billing,
    loading,
    refresh: async () => {
      if (!session?.access_token) return;
      await fetchBilling(session.access_token);
    },
  }), [billing, fetchBilling, loading, session?.access_token]);

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  return useContext(BillingContext);
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { PlanStatusCard } from "@/components/PlanStatusCard";
import { LoginForm } from "@/components/LoginForm";
import { ProductShellSkeleton } from "@/components/ProductSkeletons";
import { ANALYTICS_EVENTS, getAnalyticsContextFromBrowser, trackEvent } from "@/lib/analytics";
import { BillingProvider, useBilling } from "@/lib/use-billing";
import {
  Search,
  Plus,
  LogOut,
  Loader2,
  Menu,
  X,
  ShieldCheck,
  Settings,
} from "lucide-react";

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BillingProvider>
      <ProductLayoutShell>{children}</ProductLayoutShell>
    </BillingProvider>
  );
}

function ProductLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useAuth();
  const { billing, loading: billingLoading } = useBilling();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [adminAccess, setAdminAccess] = useState<{ userId: string; isAdmin: boolean } | null>(null);
  const hasTrackedSigninViewRef = useRef(false);
  const pendingJd = useSyncExternalStore(
    () => () => {},
    () => {
      if (typeof window === "undefined") return "";
      const params = new URLSearchParams(window.location.search);
      return params.get("jd")?.trim() || "";
    },
    () => "",
  );
  const entryMode = useSyncExternalStore(
    () => () => {},
    () => {
      if (typeof window === "undefined") return "workspace";
      const params = new URLSearchParams(window.location.search);
      return params.get("entry") || "workspace";
    },
    () => "workspace",
  );
  const isSearchIntent = pathname === "/app/search/new" && Boolean(pendingJd);
  const effectivePendingPath = pendingPath === pathname ? null : pendingPath;
  const isNewSearchRoute = pathname === "/app/search/new";
  const isSearchDetailRoute = pathname.startsWith("/app/search/") && !isNewSearchRoute;
  const isDashboardRoute =
    pathname === "/app" || (pathname.startsWith("/app/search/") && !isNewSearchRoute);
  const isSettingsRoute = pathname === "/app/settings";
  const isAdminRoute = pathname.startsWith("/app/admin");
  const isAdmin = Boolean(user && adminAccess?.userId === user.id && adminAccess.isAdmin);
  const authRedirectPath = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const getNavClassName = (isActive: boolean) =>
    `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "bg-slate-900 text-white shadow-sm"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
    }`;

  useEffect(() => {
    if (loading || user || hasTrackedSigninViewRef.current) return;

    hasTrackedSigninViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.signinView, {
      ...getAnalyticsContextFromBrowser({
        entry_mode: isSearchIntent ? "landing" : entryMode === "signin" ? "signin" : "workspace",
      }),
      route: pathname,
      has_prefilled_jd: isSearchIntent,
      signin_surface: "product_page",
    });
  }, [entryMode, isSearchIntent, loading, pathname, user]);

  useEffect(() => {
    if (!user) return;
    router.prefetch("/app");
    router.prefetch("/app/search/new");
    router.prefetch("/app/settings");
  }, [router, user]);

  useEffect(() => {
    if (!user) return;

    let isCurrent = true;
    const userId = user.id;

    fetch("/api/admin", { method: "HEAD", credentials: "include" })
      .then((res) => {
        if (isCurrent) setAdminAccess({ userId, isAdmin: res.ok });
      })
      .catch(() => {
        if (isCurrent) setAdminAccess({ userId, isAdmin: false });
      });

    return () => {
      isCurrent = false;
    };
  }, [user]);

  useEffect(() => {
    if (!sidebarOpen) return;

    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    if (!mediaQuery.matches) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  if (loading && isSearchDetailRoute) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  if (loading) {
    return <ProductShellSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.svg" alt="Hirelix" width={32} height={32} />
          <span className="text-2xl font-bold tracking-tight">Hirelix</span>
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold">
            {isSearchIntent ? "One more step to open your shortlist" : "Sign in to keep moving"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {isSearchIntent
              ? "Your JD is saved below. Sign in and we will take you straight into the real search."
              : "Use Google to continue into the next shortlist flow."}
          </p>
        </div>
        {isSearchIntent && (
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-4 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-light">
              Your JD is saved
            </p>
            <p className="mt-2 max-h-32 overflow-hidden whitespace-pre-wrap text-sm text-foreground">
              {pendingJd}
            </p>
          </div>
        )}
        <LoginForm
          redirectPath={authRedirectPath}
          contextTitle={isSearchIntent ? "Continue to your shortlist" : "Continue to Hirelix"}
          contextBody={
            isSearchIntent
              ? "No card required. Use Google to keep this shortlist flow moving."
              : "Use Google to continue without starting over."
          }
        />
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          &larr; Back to homepage
        </Link>
      </div>
    );
  }

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
        <Link
          href="/app"
          onClick={() => {
            setSidebarOpen(false);
            setPendingPath("/app");
          }}
          className="flex items-center gap-2.5 rounded-md transition-colors hover:text-slate-950"
        >
          <Image src="/logo.svg" alt="Hirelix" width={24} height={24} />
          <span className="text-lg font-semibold tracking-tight text-slate-950">Hirelix</span>
        </Link>
        <button onClick={() => setSidebarOpen(false)} className="cursor-pointer text-slate-500 hover:text-slate-950 lg:hidden">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 p-3">
        <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Workspace
        </p>
        <div className="space-y-1">
          <Link
            href="/app"
            onClick={() => {
              setSidebarOpen(false);
              setPendingPath("/app");
            }}
            className={getNavClassName(isDashboardRoute)}
          >
            {effectivePendingPath === "/app" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Shortlists
          </Link>
          <Link
            href="/app/search/new"
            onClick={() => {
              setSidebarOpen(false);
              setPendingPath("/app/search/new");
            }}
            className={getNavClassName(isNewSearchRoute)}
          >
            {effectivePendingPath === "/app/search/new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New search
          </Link>
          {isAdmin && (
            <Link
              href="/app/admin"
              onClick={() => {
                setSidebarOpen(false);
                setPendingPath("/app/admin");
              }}
              className={getNavClassName(isAdminRoute)}
            >
              {effectivePendingPath === "/app/admin" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Admin
            </Link>
          )}
        </div>
      </nav>

      <div className="border-t border-slate-200 p-3">
        <PlanStatusCard billing={billing} loading={billingLoading} />
        <div className="mt-3 space-y-1">
          <Link
            href="/app/settings#billing"
            onClick={() => {
              setSidebarOpen(false);
              setPendingPath("/app/settings");
            }}
            className={getNavClassName(isSettingsRoute)}
          >
            {effectivePendingPath === "/app/settings" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
            Settings
          </Link>
        </div>
        <div className="mt-3 truncate px-3 text-xs text-slate-500">
          {user.email}
        </div>
        <button
          onClick={() => signOut().then(() => router.push("/"))}
          className="mt-1 flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <Link
          href="/app"
          onClick={() => setPendingPath("/app")}
          className="flex items-center gap-2.5 rounded-md transition-colors hover:text-slate-950"
        >
          <Image src="/logo.svg" alt="Hirelix" width={24} height={24} />
          <span className="text-lg font-semibold tracking-tight text-slate-950">Hirelix</span>
        </Link>
        {sidebarOpen ? (
          <div aria-hidden="true" className="h-7 w-7" />
        ) : (
          <button
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            className="cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        )}
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop: fixed, mobile: drawer */}
      <aside
        className={`fixed left-0 top-0 z-[60] flex h-full w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="w-full flex-1 p-4 pt-18 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8 lg:ml-64">
        {children}
      </main>
    </div>
  );
}

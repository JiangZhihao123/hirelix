"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { LoginForm } from "@/components/LoginForm";
import { ProductShellSkeleton } from "@/components/ProductSkeletons";
import { ANALYTICS_EVENTS, getAnalyticsContextFromBrowser, trackEvent } from "@/lib/analytics";
import { BillingProvider } from "@/lib/use-billing";
import {
  Search,
  Plus,
  Settings,
  LogOut,
  Loader2,
  Menu,
  X,
} from "lucide-react";

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
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
  const isFocusedNewSearch =
    pathname === "/app/search/new" && entryMode === "landing" && Boolean(pendingJd);
  const effectivePendingPath = pendingPath === pathname ? null : pendingPath;
  const isDashboardRoute = pathname === "/app" || pathname.startsWith("/app/search/");
  const isNewSearchRoute = pathname === "/app/search/new";
  const isSettingsRoute = pathname === "/app/settings";

  const getNavClassName = (isActive: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "bg-primary/8 text-primary"
        : "text-muted hover:bg-background hover:text-foreground"
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
    if (!sidebarOpen) return;

    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    if (!mediaQuery.matches) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

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
              : "Use Google, email, or password to continue into the next shortlist flow."}
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
          contextTitle={isSearchIntent ? "Continue to your shortlist" : "Continue to Hirelix"}
          contextBody={
            isSearchIntent
              ? "No card required. Use Google or email to keep this shortlist flow moving."
              : "Use Google or email to continue without starting over."
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
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <Link
          href="/app"
          onClick={() => {
            setSidebarOpen(false);
            setPendingPath("/app");
          }}
          className="flex items-center gap-2.5 rounded-lg transition-colors hover:text-foreground"
        >
          <Image src="/logo.svg" alt="Hirelix" width={24} height={24} />
          <span className="text-lg font-bold tracking-tight">Hirelix</span>
        </Link>
        <button onClick={() => setSidebarOpen(false)} className="lg:hidden cursor-pointer text-muted hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        <Link
          href="/app"
          onClick={() => {
            setSidebarOpen(false);
            setPendingPath("/app");
          }}
          className={getNavClassName(isDashboardRoute)}
        >
          {effectivePendingPath === "/app" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          My Shortlists
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
          New Shortlist
        </Link>
        <Link
          href="/app/settings"
          onClick={() => {
            setSidebarOpen(false);
            setPendingPath("/app/settings");
          }}
          className={getNavClassName(isSettingsRoute)}
        >
          {effectivePendingPath === "/app/settings" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
          Settings & Billing
        </Link>
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 px-3 text-xs text-muted-light truncate">
          {user.email}
        </div>
        <button
          onClick={() => signOut().then(() => router.push("/"))}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-background hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
        <Link
          href="/app"
          onClick={() => setPendingPath("/app")}
          className="flex items-center gap-2.5 rounded-lg transition-colors hover:text-foreground"
        >
          <Image src="/logo.svg" alt="Hirelix" width={24} height={24} />
          <span className="text-lg font-bold tracking-tight">Hirelix</span>
        </Link>
        {isFocusedNewSearch ? (
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-700">
            Focused flow
          </span>
        ) : sidebarOpen ? (
          <div aria-hidden="true" className="h-7 w-7" />
        ) : (
          <button
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            className="cursor-pointer rounded-md p-1 text-muted hover:bg-background hover:text-foreground"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        )}
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && !isFocusedNewSearch && (
        <div
          className="fixed inset-0 z-50 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop: fixed, mobile: drawer */}
      {!isFocusedNewSearch && (
        <aside
          className={`fixed left-0 top-0 z-[60] flex h-full w-60 flex-col border-r border-border bg-surface transition-transform duration-200 lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebarContent}
        </aside>
      )}

      {/* Main content */}
      <main className={`w-full flex-1 p-4 pt-18 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8 ${isFocusedNewSearch ? "lg:ml-0" : "lg:ml-60"}`}>
        <BillingProvider>{children}</BillingProvider>
      </main>
    </div>
  );
}

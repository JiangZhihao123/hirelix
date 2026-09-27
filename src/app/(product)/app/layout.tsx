"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import "@/components/workspace/workspace.css";
import { ErrorNotice, initials, useQuery } from "@/components/workspace/client";
import type { Conversation } from "@/lib/workspace/types";
import { useAuth } from "@/components/AuthProvider";
import { LoginForm } from "@/components/LoginForm";
import { ProductShellSkeleton } from "@/components/ProductSkeletons";
import {
  ANALYTICS_EVENTS,
  getAnalyticsContextFromBrowser,
  trackEvent,
  type EntryMode,
} from "@/lib/analytics";
import { BillingProvider } from "@/lib/use-billing";
import { useT } from "@/components/LanguageProvider";
import {
  Search,
  BriefcaseBusiness,
  Bell,
  BookUser,
  FileText,
  LogOut,
  Loader2,
  Menu,
  X,
  Settings,
  Plus,
} from "lucide-react";

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BillingProvider>
      <Suspense fallback={<ProductShellSkeleton />}>
        <ProductLayoutShell>{children}</ProductLayoutShell>
      </Suspense>
    </BillingProvider>
  );
}

function ProductLayoutShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversationSearch, setConversationSearch] = useState("");
  const conversations = useQuery<{ conversations: Conversation[] }>(
    user ? "/conversations" : null,
  );
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const hasTrackedSigninViewRef = useRef(false);
  const normalizeEntryMode = (value: string | null): EntryMode => {
    if (value === "landing" || value === "signin" || value === "free_trial") {
      return value;
    }
    return "workspace";
  };
  const pendingJd = useSyncExternalStore(
    () => () => {},
    () => {
      if (typeof window === "undefined") return "";
      const params = new URLSearchParams(window.location.search);
      return params.get("jd")?.trim() || "";
    },
    () => "",
  );
  const entryMode = useSyncExternalStore<EntryMode>(
    () => () => {},
    () => {
      if (typeof window === "undefined") return "workspace";
      const params = new URLSearchParams(window.location.search);
      return normalizeEntryMode(params.get("entry"));
    },
    () => "workspace",
  );
  const isSearchIntent = pathname === "/app/search/new" && Boolean(pendingJd);
  const effectivePendingPath = pendingPath === pathname ? null : pendingPath;
  const isNewSearchRoute = pathname === "/app/search/new";
  const isSearchDetailRoute =
    pathname.startsWith("/app/search/") && !isNewSearchRoute;
  const isFreeTrialEntry = entryMode === "free_trial";
  const authRedirectPath = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const isConversationPage = pathname === "/app";
  const currentConversationId = isConversationPage
    ? searchParams.get("conversation")
    : null;
  const nav = [
    {
      href: "/app/candidates",
      label: t("Candidates"),
      icon: BookUser,
      active:
        pathname.startsWith("/app/candidates") || pathname === "/app/talent",
    },
    {
      href: "/app/roles",
      label: t("Roles"),
      icon: BriefcaseBusiness,
      active: pathname.startsWith("/app/roles"),
    },
    {
      href: "/app/submissions",
      label: t("Submissions"),
      icon: FileText,
      active:
        pathname.startsWith("/app/submissions") || pathname === "/app/briefs",
    },
  ];
  function navigate(path: string) {
    setSidebarOpen(false);
    setPendingPath(path);
  }

  useEffect(() => {
    if (loading || user || hasTrackedSigninViewRef.current) return;

    hasTrackedSigninViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.signinView, {
      ...getAnalyticsContextFromBrowser({
        entry_mode: entryMode,
      }),
      route: pathname,
      has_prefilled_jd: isSearchIntent,
      signin_surface: "product_page",
    });
  }, [entryMode, isSearchIntent, loading, pathname, user]);

  useEffect(() => {
    if (!user) return;
    router.prefetch("/app");
    router.prefetch("/app/candidates");
    router.prefetch("/app/submissions");
    router.prefetch("/app/roles");
    router.prefetch("/app/search/new");
    router.prefetch("/app/settings");
  }, [router, user]);

  useEffect(() => {
    if (!user) return;
    window.addEventListener("hirelix:conversations-changed", conversations.refresh);
    return () =>
      window.removeEventListener("hirelix:conversations-changed", conversations.refresh);
  }, [user, conversations.refresh]);

  useEffect(() => {
    if (!sidebarOpen) return;

    const mediaQuery = window.matchMedia("(max-width: 850px)");
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
      <div className="private-workspace flex min-h-screen flex-col items-center justify-center gap-8 px-6">
        <div className="flex items-center gap-2.5">
          <span className="text-3xl font-semibold tracking-tight text-primary">
            {t("hirelix")}
          </span>
        </div>
        <h1 className="text-center text-xl font-semibold">
          {isSearchIntent
            ? t("Sign in to open your shortlist")
            : isFreeTrialEntry
              ? t("Start with your private assistant")
              : t("Sign in to Hirelix")}
        </h1>
        {isFreeTrialEntry && !isSearchIntent ? (
          <p className="-mt-5 max-w-sm text-center text-sm leading-6 text-muted">
            {t("Your candidates, your roles, and the work you prepare for clients.")}
          </p>
        ) : null}
        {isSearchIntent && (
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-4 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-light">
              {t("Your JD is saved")}
            </p>
            <p className="mt-2 max-h-32 overflow-hidden whitespace-pre-wrap text-sm text-foreground">
              {pendingJd}
            </p>
          </div>
        )}
        <LoginForm redirectPath={authRedirectPath} />
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          {t("← Back to homepage")}
        </Link>
      </div>
    );
  }

  const displayName =
    user.user_metadata?.name || user.email?.split("@")[0] || "Your account";
  return (
    <div className="private-workspace">
      {sidebarOpen && (
        <button
          className="ws-overlay"
          aria-label={t("Close navigation")}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className="ws-sidebar"
        data-open={sidebarOpen}
        aria-label={t("Main navigation")}
      >
        <div className="ws-brand">
          <Link
            href="/app"
            onClick={() => navigate("/app")}
            aria-label={t("hirelix")}
          >
            <span className="ws-brand-full">{t("hirelix")}</span>
          </Link>
          <button
            className="ws-icon ws-mobile-only"
            aria-label={t("Close navigation")}
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <Link
          className="ws-sidebar-new"
          href="/app"
          onClick={() => navigate("/app")}
          aria-current={isConversationPage && !currentConversationId ? "page" : undefined}
        >
          <Plus size={17} />
          <span>{t("New conversation")}</span>
        </Link>
        <nav className="ws-nav">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => navigate(item.href)}
              aria-current={item.active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
            >
              {effectivePendingPath === item.href ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <item.icon size={16} />
              )}
              <span>{item.label}</span>
            </Link>
          ))}
          <small>{t("TOOLS")}</small>
          <Link
            href="/app/searches"
            onClick={() => navigate("/app/searches")}
            aria-label={t("Sourcing")}
            title={t("Sourcing")}
            aria-current={
              pathname.startsWith("/app/search") ? "page" : undefined
            }
          >
            <Search size={16} />
            <span>{t("Sourcing")}</span>
          </Link>
        </nav>
        <section className="ws-sidebar-conversations" aria-label={t("Conversation history")}>
          <div className="ws-sidebar-conversations-heading">
            <strong>{t("Conversations")}</strong>
          </div>
          <label className="ws-sidebar-conversation-search">
            <Search size={15} />
            <input
              value={conversationSearch}
              onChange={(event) => setConversationSearch(event.target.value)}
              placeholder={t("Search conversations")}
              aria-label={t("Search conversations")}
            />
          </label>
          <div className="ws-sidebar-conversation-list">
            <ErrorNotice error={conversations.error} retry={conversations.refresh} />
            {conversations.data?.conversations
              .filter((conversation) =>
                conversation.title
                  .toLocaleLowerCase()
                  .includes(conversationSearch.toLocaleLowerCase()),
              )
              .map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/app?conversation=${conversation.id}`}
                  onClick={() => navigate("/app")}
                  aria-current={
                    conversation.id === currentConversationId ? "page" : undefined
                  }
                  title={conversation.title}
                >
                  <strong>{conversation.title}</strong>
                </Link>
              ))}
            {conversations.data && !conversations.data.conversations.length && (
              <p>{t("Your saved conversations will appear here.")}</p>
            )}
            {conversations.data &&
              !!conversations.data.conversations.length &&
              !conversations.data.conversations.some((conversation) =>
                conversation.title
                  .toLocaleLowerCase()
                  .includes(conversationSearch.toLocaleLowerCase()),
              ) && <p>{t("No matching conversations")}</p>}
          </div>
        </section>
        <div className="ws-sidebar-bottom">
          <nav className="ws-nav">
            <Link
              href="/app/settings"
              onClick={() => navigate("/app/settings")}
              aria-label={t("Settings")}
              title={t("Settings")}
              aria-current={pathname === "/app/settings" ? "page" : undefined}
            >
              <Settings size={16} />
              <span>{t("Settings")}</span>
            </Link>
          </nav>
          <div className="ws-account">
            <span className="ws-avatar">{initials(String(displayName))}</span>
            <div>
              <strong title={user.email}>{String(displayName)}</strong>
            </div>
            <button
              className="ws-icon"
              aria-label={t("Sign out")}
              title={t("Sign out")}
              onClick={() => signOut().then(() => router.push("/"))}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <main className="ws-main">
        <div className={`ws-topbar ${isConversationPage ? "ws-topbar-conversation" : ""}`}>
          <div className="ws-actions">
            <button
              className="ws-icon ws-mobile-only"
              aria-label={t("Open navigation")}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={18} />
            </button>
            <span>
              {isConversationPage
                ? t("hirelix")
                : nav.find((item) => item.active)?.label || t("Workspace")}
            </span>
          </div>
          <div className="ws-topbar-actions">
            {isConversationPage ? (
              <Link href="/app" className="ws-icon" aria-label={t("New conversation")}>
                <Plus size={18} />
              </Link>
            ) : (
              <>
                <Link
                  href="/app/candidates"
                  className="ws-icon"
                  aria-label={t("Search your candidates")}
                >
                  <Search size={17} />
                </Link>
                <Link
                  href="/app/tasks"
                  className="ws-icon"
                  aria-label={t("Tasks and notifications")}
                >
                  <Bell size={17} />
                </Link>
              </>
            )}
          </div>
        </div>
        {pathname.startsWith("/app/search") || pathname === "/app/settings" ? (
          <div className="p-5 lg:p-8">{children}</div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

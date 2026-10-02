"use client";
import { formatCredits } from "@/lib/agent-plan";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import "@/components/workspace/workspace.css";
import {
  ErrorNotice,
  date,
  initials,
  useQuery,
} from "@/components/workspace/client";
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
import { BillingProvider, useBilling } from "@/lib/use-billing";
import { BrandMark } from "@/components/BrandMark";
import { useT, useLanguage } from "@/components/LanguageProvider";
import { DraftNotifications } from "@/components/workspace/notifications";
import { ConversationSearch } from "@/components/workspace/conversation-search";
import {
  Search,
  BriefcaseBusiness,
  ListChecks,
  BookUser,
  FileText,
  LogOut,
  Loader2,
  Menu,
  X,
  Settings,
  Languages,
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
  const { locale } = useLanguage();
  const { billing } = useBilling();
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  const conversations = useQuery<{ conversations: Conversation[] }>(
    user ? "/conversations" : null,
  );
  const duplicateConversationTitles = new Set(
    conversations.data?.conversations
      .map((conversation) => conversation.title)
      .filter((title, index, titles) => titles.indexOf(title) !== index) || [],
  );
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const hasTrackedSigninViewRef = useRef(false);
  const normalizeEntryMode = (value: string | null): EntryMode => {
    if (value === "landing" || value === "signin" || value === "free_trial") {
      return value;
    }
    return "workspace";
  };
  const pendingJd = searchParams.get("jd")?.trim() || "";
  const entryMode = normalizeEntryMode(searchParams.get("entry"));
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
    if (!user) return;
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSidebarOpen(false);
        setConversationSearchOpen(true);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [user]);

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
        <div className="flex items-center gap-2.5 text-[#205846]">
          <BrandMark small />
          <span className="text-3xl font-semibold tracking-tight text-primary">
            {"Hirelix"}
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
      {conversationSearchOpen && (
        <ConversationSearch
          recent={conversations.data?.conversations || []}
          onClose={() => setConversationSearchOpen(false)}
          onSelect={(id) => {
            setConversationSearchOpen(false);
            navigate("/app");
            router.push(`/app?conversation=${id}`);
          }}
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
            aria-label={"Hirelix"}
          >
            <span className="ws-brand-full" style={{ display: "inline-flex", gap: 9, alignItems: "center" }}><BrandMark small />{"Hirelix"}</span>
          </Link>
          <button
            className="ws-icon ws-mobile-only"
            aria-label={t("Close navigation")}
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="ws-sidebar-scroll">
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
              <button
                type="button"
                className="ws-icon"
                aria-label={t("Search conversations")}
                title={t("Search conversations")}
                onClick={() => {
                  setSidebarOpen(false);
                  setConversationSearchOpen(true);
                }}
              >
                <Search size={16} />
              </button>
            </div>
            <div className="ws-sidebar-conversation-list">
              <ErrorNotice error={conversations.error} retry={conversations.refresh} />
              {conversations.data?.conversations
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
                    {duplicateConversationTitles.has(conversation.title) && (
                      <small>{date(conversation.updated_at, true)}</small>
                    )}
                  </Link>
                ))}
              {conversations.data && !conversations.data.conversations.length && (
                <p>{t("Your saved conversations will appear here.")}</p>
              )}
            </div>
          </section>
        </div>
        <div className="ws-sidebar-bottom">
          <nav className="ws-nav">
            {billing?.agent && billing.agent.state !== "legacy" && <Link className="ws-trial-status" href="/app/settings?section=billing">
            <strong>{billing.agent.state === "paid" ? t("Personal Agent") : billing.agent.state === "expired" ? t("Trial ended") : t("7-day free trial")}</strong>
            <span>{t("{count} AI credits remaining").replace("{count}", formatCredits(billing.agent.remaining,locale))}</span>
            <span>{billing.agent.state === "trial_ready" ? t("Starts with your first task · No card") : t("View plan and subscription →")}</span>
          </Link>}
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
          <Link
              href="/app/settings?section=language"
              onClick={() => navigate("/app/settings")}
              aria-label={t("Language")}
              title={t("Language")}
            >
              <Languages size={16} />
              <span>{t("Language")}</span>
              <span className="ws-sidebar-language">{locale === "zh" ? "中文" : "English"}</span>
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
                ? "Hirelix"
                : nav.find((item) => item.active)?.label || t("Workspace")}
            </span>
          </div>
          <div className="ws-topbar-actions">
            <DraftNotifications />
            {isConversationPage ? (
              <>
                <button
                  type="button"
                  className="ws-icon ws-mobile-only"
                  aria-label={t("Search conversations")}
                  onClick={() => setConversationSearchOpen(true)}
                >
                  <Search size={18} />
                </button>
                <Link
                  href="/app"
                  className="ws-icon"
                  aria-label={t("New conversation")}
                >
                  <Plus size={18} />
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/app/candidates"
                  className="ws-icon ws-mobile-only"
                  aria-label={t("Search your candidates")}
                  title={t("Search your candidates")}
                  onClick={(event) => {
                    if (pathname === "/app/candidates") {
                      event.preventDefault();
                      document.getElementById("candidate-search")?.focus();
                    }
                  }}
                >
                  <Search size={17} />
                </Link>
                <Link
                  href="/app/tasks"
                  className="ws-icon"
                  aria-label={t("Background tasks")}
                  title={t("Background tasks")}
                >
                  <ListChecks size={17} />
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

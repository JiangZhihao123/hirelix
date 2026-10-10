"use client";
import { formatCredits } from "@/lib/agent-plan";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link, { useLinkStatus } from "next/link";
import "@/components/workspace/workspace.css";
import {
  api,
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
import { ConversationSearch } from "@/components/workspace/conversation-search";
import {
  Search,
  BriefcaseBusiness,
  BookUser,
  LogOut,
  Loader2,
  Menu,
  X,
  Settings,
  CreditCard,
  ChevronUp,
  ChevronRight,
  Plus,
  MessageSquare,
} from "lucide-react";

function NavigationIcon({ icon: Icon }: { icon: typeof MessageSquare }) {
  const { pending } = useLinkStatus();
  return pending
    ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
    : <Icon size={16} aria-hidden="true" />;
}

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
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  const conversations = useQuery<{ conversations: Conversation[] }>(
    user ? "/conversations" : null,
  );
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(conversations.refresh, 15000);
    return () => clearInterval(timer);
  }, [user, conversations.refresh]);
  useEffect(() => {
    const id = searchParams.get("conversation");
    if (pathname === "/app" && id && conversations.data?.conversations.some(item => item.id === id && item.unread)) {
      api("/notifications", {method:"POST",body:JSON.stringify({conversation_id:id})}).then(conversations.refresh).catch(() => {});
    }
  }, [pathname, searchParams, conversations.data, conversations.refresh]);
  const duplicateConversationTitles = new Set(
    conversations.data?.conversations
      .map((conversation) => conversation.title)
      .filter((title, index, titles) => titles.indexOf(title) !== index) || [],
  );
  const hasTrackedSigninViewRef = useRef(false);
  const normalizeEntryMode = (value: string | null): EntryMode => {
    if (value === "landing" || value === "signin" || value === "free_trial") {
      return value;
    }
    return "workspace";
  };
  const entryMode = normalizeEntryMode(searchParams.get("entry"));
  const isFreeTrialEntry = entryMode === "free_trial";
  const authRedirectPath = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const isConversationPage = pathname === "/app";
  const currentConversationId = isConversationPage
    ? searchParams.get("conversation")
    : null;
  const nav = [
    { href: "/app", label: t("AI assistant"), icon: MessageSquare, active: isConversationPage },
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

  ];
  function navigate() {
    accountMenuRef.current?.hidePopover();
    setSidebarOpen(false);
  }

  useEffect(() => {
    if (loading || user || hasTrackedSigninViewRef.current) return;

    hasTrackedSigninViewRef.current = true;
    trackEvent(ANALYTICS_EVENTS.signinView, {
      ...getAnalyticsContextFromBrowser({
        entry_mode: entryMode,
      }),
      route: pathname,
      has_prefilled_jd: false,
      signin_surface: "product_page",
    });
  }, [entryMode, loading, pathname, user]);

  useEffect(() => {
    if (!user) return;
    router.prefetch("/app");
    router.prefetch("/app/candidates");
    router.prefetch("/app/submissions");
    router.prefetch("/app/roles");
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
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const closeMenu = () => { accountMenuRef.current?.hidePopover(); setSidebarOpen(false); };
    window.addEventListener("resize", closeMenu);
    return () => window.removeEventListener("resize", closeMenu);
  }, []);

  useEffect(() => {
    if (!sidebarOpen && window.matchMedia("(max-width: 850px)").matches) {
      accountMenuRef.current?.hidePopover();
    }
  }, [sidebarOpen]);

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
          {isFreeTrialEntry
            ? t("Start with your private AI assistant")
            : t("Sign in to Hirelix")}
        </h1>
        {isFreeTrialEntry ? (
          <p className="-mt-5 max-w-sm text-center text-sm leading-6 text-muted">
            {t("Your candidates, your roles, and the work you prepare for clients.")}
          </p>
        ) : null}
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
            navigate();
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
            onClick={() => navigate()}
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
          <nav className="ws-nav">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => navigate()}
                aria-current={item.active ? "page" : undefined}
                aria-label={item.label}
                title={item.label}
              >
                <NavigationIcon icon={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
          {<section className="ws-sidebar-conversations" aria-label={t("Conversation history")}>
            <div className="ws-sidebar-conversations-heading">
              <strong>{t("Conversations")}</strong>
              <div className="ws-actions">
                <Link href="/app?new=1" className="ws-icon" onNavigate={(event) => {
                  if (pathname === "/app") {
                    event.preventDefault();
                    // Conversation changes are client-owned query changes,
                    // just like opening a newly saved conversation.
                    window.history.pushState(null, "", "/app?new=1");
                  }
                  navigate();
                }} aria-label={t("New conversation")} title={t("New conversation")}><Plus size={16} /></Link>
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
            </div>
            <div className="ws-sidebar-conversation-list">
              <ErrorNotice error={conversations.error} retry={conversations.refresh} />
              {conversations.data?.conversations
                .map((conversation) => (
                  <Link
                    key={conversation.id}
                    href={`/app?conversation=${conversation.id}`}
                    onClick={() => navigate()}
                    aria-current={
                      conversation.id === currentConversationId ? "page" : undefined
                    }
                    title={conversation.title}
                  >
                    <strong>{conversation.title}{conversation.unread && <span className="ws-unread-dot" aria-label={t("Unread result")}> •</span>}</strong>
                    {duplicateConversationTitles.has(conversation.title) && (
                      <small>{date(conversation.updated_at, true)}</small>
                    )}
                  </Link>
                ))}
              {conversations.data && !conversations.data.conversations.length && (
                <p>{t("Your saved conversations will appear here.")}</p>
              )}
            </div>
          </section>}
        </div>
        <div className="ws-sidebar-bottom">
          <button
            type="button"
            className="ws-account-trigger"
            popoverTarget="workspace-account-menu"
            aria-label={t("Account menu")}
          >
            <span className="ws-avatar">{initials(String(displayName))}</span>
            <strong title={user.email}>{String(displayName)}</strong>
            <ChevronUp size={16} aria-hidden="true" />
          </button>
          <div
            ref={accountMenuRef}
            id="workspace-account-menu"
            popover="auto"
            className="ws-account-menu"
            aria-label={t("Account menu")}
          >
          <nav className="ws-nav">
            {billing?.agent && billing.agent.state !== "legacy" && (
              <Link
                className="ws-credit-status"
                href="/app/settings?section=billing"
                title={t("View plan and subscription →")}
                onClick={() => navigate()}
              >
                <span>{t("{count} AI credits remaining").replace("{count}", formatCredits(billing.agent.remaining, locale))}</span>
                <ChevronRight size={14} aria-hidden="true" />
              </Link>
            )}
          </nav>
            <nav className="ws-nav">
              <Link href="/app/settings" onClick={() => { accountMenuRef.current?.hidePopover(); navigate(); }}>
                <Settings size={16} />{t("Settings")}
              </Link>
              <Link href="/app/settings?section=billing" onClick={() => { accountMenuRef.current?.hidePopover(); navigate(); }}>
                <CreditCard size={16} />{t("Billing")}
              </Link>
            </nav>
            <button
              type="button"
              className="ws-account-logout"
              onClick={() => { accountMenuRef.current?.hidePopover(); void signOut().then(() => router.push("/")); }}
            >
              <LogOut size={16} />{t("Sign out")}
            </button>
          </div>
        </div>
      </aside>
      <main className="ws-main" inert={sidebarOpen}>
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
                : nav.find((item) => item.active)?.label || (pathname === "/app/settings" ? t("Settings") : t("Workspace"))}
            </span>
          </div>
          <div className="ws-topbar-actions">
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
                  href="/app?new=1"
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
                  href="/app"
                  className="ws-topbar-task"
                  aria-label={t("AI assistant")}
                  title={t("AI assistant")}
                >
                  <MessageSquare size={17} /><span>{t("AI assistant")}</span>
                </Link>
              </>
            )}
          </div>
        </div>
        {pathname === "/app/settings" ? (
          <div className="p-5 lg:p-8">{children}</div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

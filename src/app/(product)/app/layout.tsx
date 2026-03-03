"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { LoginForm } from "@/components/LoginForm";
import {
  Search,
  Plus,
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.svg" alt="Hirelix" width={32} height={32} />
          <span className="text-2xl font-bold tracking-tight">Hirelix</span>
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold">Sign in to continue</h1>
          <p className="mt-2 text-sm text-muted">
            Enter your email to receive a magic link
          </p>
        </div>
        <LoginForm />
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          &larr; Back to homepage
        </Link>
      </div>
    );
  }

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.svg" alt="Hirelix" width={24} height={24} />
          <span className="text-lg font-bold tracking-tight">Hirelix</span>
        </div>
        <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        <Link
          href="/app"
          onClick={() => setSidebarOpen(false)}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-background hover:text-foreground"
        >
          <Search className="h-4 w-4" />
          My Searches
        </Link>
        <Link
          href="/app/search/new"
          onClick={() => setSidebarOpen(false)}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" />
          New Search
        </Link>
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 px-3 text-xs text-muted-light truncate">
          {user.email}
        </div>
        <button
          onClick={() => signOut().then(() => router.push("/"))}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-background hover:text-foreground"
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
      <div className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.svg" alt="Hirelix" width={24} height={24} />
          <span className="text-lg font-bold tracking-tight">Hirelix</span>
        </div>
        <button onClick={() => setSidebarOpen(true)} className="text-muted hover:text-foreground">
          <Menu className="h-5 w-5" />
        </button>
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
        className={`fixed left-0 top-0 z-50 flex h-full w-60 flex-col border-r border-border bg-surface transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="w-full pt-14 lg:ml-60 lg:pt-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}

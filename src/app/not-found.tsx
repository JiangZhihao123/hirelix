"use client";

import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#020817] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-12">
        <Image src="/logo.svg" alt="Hirelix logo" width={28} height={28} />
        <span className="text-white text-lg font-semibold tracking-tight">
          Hirelix
        </span>
      </Link>

      {/* 404 */}
      <h1 className="text-8xl font-bold text-amber-400 leading-none mb-4">
        404
      </h1>

      {/* Subtitle */}
      <h2 className="text-2xl font-semibold text-white mb-3">
        Page not found
      </h2>

      {/* Description */}
      <p className="text-slate-400 text-base text-center max-w-sm mb-10">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      {/* Buttons */}
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="px-5 py-2.5 rounded-lg bg-amber-400 text-[#020817] font-semibold text-sm hover:bg-amber-300 transition-colors"
        >
          Go home
        </Link>
        <Link
          href="/app"
          className="px-5 py-2.5 rounded-lg border border-slate-600 text-slate-300 font-semibold text-sm hover:border-slate-400 hover:text-white transition-colors"
        >
          Open app
        </Link>
      </div>
    </div>
  );
}

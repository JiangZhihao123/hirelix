"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export function useListState() {
  const params = useSearchParams();
  const pathname = usePathname();
  const update = useCallback(
    (values: Record<string, string | number | null>, resetPage = true) => {
      const next = new URLSearchParams(window.location.search);
      if (resetPage) next.delete("page");
      for (const [key, value] of Object.entries(values)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      window.history.replaceState(
        null,
        "",
        `${pathname}${next.size ? `?${next}` : ""}`,
      );
    },
    [pathname],
  );
  return {
    params,
    update,
    href: `${pathname}${params.size ? `?${params}` : ""}`,
  };
}

// Restore only after rows have loaded, so the browser can reach the saved offset.
export function useListScroll(href: string, ready: boolean) {
  const key = `hirelix:list-scroll:${href}`;
  const restored = useRef("");
  useEffect(() => {
    if (!ready) {
      restored.current = "";
      return;
    }
    if (restored.current === key) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, Number(sessionStorage.getItem(key) || 0));
      restored.current = key;
    });
    return () => cancelAnimationFrame(frame);
  }, [key, ready]);
  return () => sessionStorage.setItem(key, String(window.scrollY));
}

export function FilterInput({
  value,
  onChange,
  placeholder,
  label = placeholder,
  list,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  list?: string;
}) {
  const [input, setInput] = useState({ value, draft: value });
  if (input.value !== value) setInput({ value, draft: value });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <input
      aria-label={label}
      placeholder={placeholder}
      list={list}
      value={input.draft}
      onChange={(e) => {
        const next = e.target.value;
        setInput({ value, draft: next });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(next), 300);
      }}
    />
  );
}
export function ListSearch(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="ws-search">
      <Search size={16} />
      <FilterInput {...props} />
    </div>
  );
}

export function SortHeading({
  field,
  sort,
  direction,
  onSort,
  children,
}: {
  field: string;
  sort: string;
  direction: string;
  onSort: (field: string, direction: string) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="ws-sort-heading"
      aria-label={`${children} ${sort === field ? (direction === "asc" ? "↑" : "↓") : "↕"}`}
      onClick={() =>
        onSort(field, sort === field && direction === "asc" ? "desc" : "asc")
      }
    >
      {children}
      <span aria-hidden="true">
        {sort === field ? (
          direction === "asc" ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )
        ) : (
          <ArrowUpDown size={12} />
        )}
      </span>
    </button>
  );
}

export function ListPagination({
  page,
  total,
  size = 50,
  onPage,
}: {
  page: number;
  total: number;
  size?: number;
  onPage: (page: number) => void;
}) {
  const { locale } = useLanguage();
  if (total <= size && page === 1) return null;
  return (
    <div className="ws-pagination">
      <button
        className="ws-button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        {locale === "zh" ? "上一页" : "Previous"}
      </button>
      <span>
        {page} / {Math.max(1, Math.ceil(total / size))}
      </span>
      <button
        className="ws-button"
        disabled={page * size >= total}
        onClick={() => onPage(page + 1)}
      >
        {locale === "zh" ? "下一页" : "Next"}
      </button>
    </div>
  );
}

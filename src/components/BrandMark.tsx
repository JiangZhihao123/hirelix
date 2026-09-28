/** The green four-shape Hirelix mark, shared by marketing and product surfaces. */
export function BrandMark({ small = false, className = "" }: { small?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={small ? 24 : 48} height={small ? 24 : 48} fill="currentColor" className={className} aria-hidden="true" style={{ flexShrink: 0, color: "#205846", transform: "rotate(-8deg)" }}>
      <rect x="3" y="3" width="11" height="11" rx="2" />
      <circle cx="23.5" cy="8.5" r="5.5" opacity=".5" />
      <rect x="3" y="18" width="11" height="11" rx="2" opacity=".5" />
      <path d="M20 18h7a2 2 0 0 1 2 2v2a7 7 0 0 1-7 7h-2a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

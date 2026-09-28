/** The original Hirelix mark, shared by marketing and product surfaces. */
export function BrandMark({ small = false, className = "" }: { small?: boolean; className?: string }) {
  return (
    <svg width={small ? 24 : 42} height={small ? 24 : 42} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="32" height="32" rx="8" fill="#2563EB" />
      <path d="M8 11.5C8 10.6716 8.67157 10 9.5 10H14.5C15.3284 10 16 10.6716 16 11.5V14.5C16 15.3284 15.3284 16 14.5 16H9.5C8.67157 16 8 15.3284 8 14.5V11.5Z" fill="white" opacity="0.9" />
      <path d="M17 17.5C17 16.6716 17.6716 16 18.5 16H22.5C23.3284 16 24 16.6716 24 17.5V20.5C24 21.3284 23.3284 22 22.5 22H18.5C17.6716 22 17 21.3284 17 20.5V17.5Z" fill="white" opacity="0.7" />
      <circle cx="20.5" cy="11.5" r="2.5" fill="white" opacity="0.5" />
      <circle cx="11.5" cy="20.5" r="2.5" fill="white" opacity="0.5" />
      <path d="M14.5 13L17.5 16.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

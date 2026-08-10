/** Line drawing shown when a product has no photography yet. */
export function PanelPlaceholder({ className = "h-20 w-20" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`text-line-strong ${className}`}
      aria-hidden
    >
      <rect x="9" y="8" width="46" height="48" />
      <rect x="16" y="16" width="32" height="12" />
      <circle cx="20" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="26" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="32" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <path d="M20 21h10M20 24.5h18" />
      <circle cx="22" cy="41" r="4" />
      <circle cx="42" cy="41" r="4" />
      <path d="M32 37v8" />
    </svg>
  );
}

import { site } from "@/content/site";

/**
 * Wordmark with a square accent mark.
 *
 * Deliberately plain: an industrial manufacturer's mark is a wordmark, not an
 * illustrated badge. The previous rounded-square-with-a-tick read as an app
 * icon. TODO(vkon): replace with the real logo if one exists.
 */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <rect width="28" height="28" className="fill-graphite-950" />
      <path
        d="M7 8.5 14 20l7-11.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.6"
      />
      <rect x="19.5" y="6" width="4" height="4" className="fill-brand-500" />
    </svg>
  );
}

export function Logo({
  className = "",
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <span className={`flex items-baseline gap-2.5 ${className}`}>
      <span
        className={`text-[1.375rem] font-semibold leading-none tracking-[-0.03em] ${
          tone === "light" ? "text-band-ink" : "text-ink"
        }`}
      >
        {site.name}
      </span>
      <span
        className={`label-tech ${tone === "light" ? "text-band-muted" : "text-muted"}`}
      >
        Control Panels
      </span>
    </span>
  );
}

import Image from "next/image";
import { site } from "@/content/site";

/**
 * Brand lockup: the circular badge as a mark, plus a legible wordmark.
 *
 * The badge itself contains "vkon AUTOMATION", but at 36px that inner text is
 * unreadable — so the mark carries recognition and the text carries the name.
 * Repeating the name across mark and wordmark is normal practice.
 *
 * The source is a JPEG on white, converted to a circular PNG with a transparent
 * surround (scripts note in DEPLOYMENT/README). The badge is dark navy, so on
 * dark surfaces it is set on a white plate — otherwise it disappears into the
 * footer.
 *
 * TODO(vkon): swap in an SVG when one exists — a 512px raster is heavier than
 * it needs to be and will soften on high-DPI screens at large sizes.
 */
export function LogoMark({
  className = "h-9 w-9",
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden rounded-full ${
        onDark ? "bg-white p-[2px]" : ""
      } ${className}`}
    >
      <Image
        src="/brand/vkon-logo.png"
        alt=""
        fill
        sizes="40px"
        priority
        className="object-contain"
      />
    </span>
  );
}

export function Logo({
  className = "",
  tone = "dark",
}: {
  className?: string;
  /** `light` = sitting on a dark surface. */
  tone?: "dark" | "light";
}) {
  const onDark = tone === "light";

  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-9 w-9" onDark={onDark} />
      <span className="flex flex-col leading-none">
        <span
          className={`text-[1.3rem] font-semibold leading-none tracking-[-0.03em] ${
            onDark ? "text-band-ink" : "text-ink"
          }`}
        >
          {site.name}
        </span>
        <span
          className={`label-tech mt-1 ${onDark ? "text-band-muted" : "text-muted"}`}
        >
          Automation
        </span>
      </span>
    </span>
  );
}

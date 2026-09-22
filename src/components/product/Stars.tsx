/**
 * The star line: "4.3 ★★★★½ 230" (client, 2026-09-22, with a screenshot of
 * Amazon's).
 *
 * **One SVG per star, clipped to the fraction it has earned**, rather than
 * rounding to the nearest half: 4.3 draws a star 30% filled, which is what
 * the number beside it claims. A `linearGradient` per instance would be five
 * more DOM nodes a card; a clipped overlay is one extra span.
 *
 * No hooks, so the catalogue grid (server) and the review form (client) share
 * it.
 */
export function Stars({
  rating,
  size = 16,
  className = "",
}: {
  /** 0–5, fractions allowed. */
  rating: number;
  /** Pixels per star. */
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, rating));
  return (
    <span
      className={`relative inline-flex shrink-0 align-middle ${className}`}
      style={{ width: size * 5, height: size }}
      aria-hidden
    >
      <span className="absolute inset-0 flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={size} className="text-line-strong" />
        ))}
      </span>
      {/* The filled copy, cut off at the rating. `overflow-hidden` on a
          percentage width is what makes a part-filled star. */}
      <span
        className="absolute inset-y-0 left-0 flex overflow-hidden"
        style={{ width: `${(clamped / 5) * 100}%` }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={size} className="text-orange-500" />
        ))}
      </span>
    </span>
  );
}

/**
 * One star, for the rating picker on an order (2026-09-22).
 *
 * The picker cannot use `Stars` per choice: that draws the whole five-star
 * strip at a width of `size × 5`, set inline, so five of them overlapped into
 * the smear the client photographed.
 */
export function StarGlyph({
  size = 24,
  fill = 0,
  className = "",
}: {
  size?: number;
  /** 0, 0.5 or 1 — the picker needs half a star to offer 4.5. */
  fill?: number;
  className?: string;
}) {
  return (
    <span
      className={`relative inline-block shrink-0 align-middle ${className}`}
      style={{ width: size, height: size }}
    >
      <Star size={size} className="absolute inset-0 text-line-strong" />
      {fill > 0 && (
        <span
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${Math.min(1, fill) * 100}%` }}
        >
          <Star size={size} className="text-orange-500" />
        </span>
      )}
    </span>
  );
}

function Star({ size, className }: { size: number; className: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`shrink-0 ${className}`}
    >
      <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L10 14.77l-5.2 2.73.99-5.78-4.21-4.1 5.82-.85L10 1.5z" />
    </svg>
  );
}

/** "4.3" — one decimal, and no trailing ".0" on a whole number. */
export function formatRating(average: number): string {
  return Number.isInteger(average) ? String(average) : average.toFixed(1);
}

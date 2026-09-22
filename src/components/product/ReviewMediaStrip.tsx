import type { ReviewMedia } from "@/lib/db/reviews";

/**
 * The photos and clips on a published review (client, 2026-09-22).
 *
 * **A plain `img`, not `next/image`.** These are customer uploads of unknown
 * dimensions shown at a fixed 96px; running them through the optimiser would
 * be a round trip to produce a thumbnail we already have. The file is a
 * same-origin `/media` upload, stored by `lib/storage.ts` after checking what
 * its bytes really are.
 *
 * Clips carry `controls` and `preload="metadata"` — nothing downloads a video
 * on a rural connection until somebody presses play.
 */
export function ReviewMediaStrip({ media }: { media: ReviewMedia[] }) {
  if (media.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {media.map((item) => (
        <li key={item.url}>
          {item.kind === "video" ? (
            <video
              src={item.url}
              controls
              preload="metadata"
              className="h-24 w-24 border border-line bg-surface-subtle object-cover"
            />
          ) : (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt=""
                loading="lazy"
                className="h-24 w-24 border border-line bg-surface-subtle object-cover transition-opacity hover:opacity-90"
              />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

"use client";

import { useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons/ui";
import { ReviewLightbox, lightboxItems, type LightboxItem } from "@/components/product/ReviewCard";
import type { Review } from "@/lib/db/reviews";

/**
 * "Reviews with images": a scrolling row of thumbnails, with **See all
 * photos** beside the heading (client, 2026-09-22, from a screenshot).
 *
 * **One thumbnail per review, but "See all photos" walks every picture.** The
 * row is a way into the reviews, so one picture stands for one person and
 * opens their review; the link opens the same viewer over a flat list of
 * every photo on the product, with the review beside each one changing as you
 * step. A review with four photos would otherwise take the whole row.
 *
 * Arrows sit outside the strip and scroll by roughly a screenful. The row
 * scrolls by touch, so they are hidden on a phone where they would be in the
 * way.
 */
export function ReviewPhotoStrip({
  reviews,
  ownReviewId,
}: {
  reviews: Review[];
  ownReviewId: string | null;
}) {
  const withMedia = reviews.filter((review) => review.media.length > 0);
  const track = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState<{ items: LightboxItem[]; index: number } | null>(null);

  if (withMedia.length === 0) return null;

  const everything = withMedia.flatMap(lightboxItems);
  const scroll = (by: number) => {
    const el = track.current;
    if (el) el.scrollBy({ left: by * Math.max(280, el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div className="mb-8 border-b border-line pb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold text-ink">Reviews with images</h2>
        {everything.length > 1 && (
          <button
            type="button"
            onClick={() => setOpen({ items: everything, index: 0 })}
            className="text-sm font-medium text-accent hover:underline"
          >
            See all photos <span aria-hidden>›</span>
          </button>
        )}
      </div>

      <div className="relative mt-4">
        <ul ref={track} className="hscroll flex gap-3 overflow-x-auto scroll-smooth">
          {withMedia.map((review) => {
            const first = review.media[0];
            return (
              <li key={review.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setOpen({ items: lightboxItems(review), index: 0 })}
                  aria-label={`Open ${
                    review.id === ownReviewId ? "your" : `${review.customerName || "a customer"}’s`
                  } review`}
                  className="relative block h-32 w-32 overflow-hidden rounded-md border border-line bg-surface-subtle transition-colors hover:border-ink sm:h-44 sm:w-44"
                >
                  {first.kind === "video" ? (
                    <>
                      <video src={first.url} preload="metadata" className="h-full w-full object-cover" />
                      <span
                        aria-hidden
                        className="absolute inset-0 flex items-center justify-center text-3xl text-white drop-shadow"
                      >
                        ▶
                      </span>
                    </>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={first.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {withMedia.length > 3 && (
          <>
            <button
              type="button"
              onClick={() => scroll(-1)}
              aria-label="Scroll back"
              className="absolute -left-4 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md border border-line-strong bg-surface text-ink shadow-card hover:border-ink sm:flex"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              aria-label="Scroll forward"
              className="absolute -right-4 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md border border-line-strong bg-surface text-ink shadow-card hover:border-ink sm:flex"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {open && (
        <ReviewLightbox
          items={open.items}
          index={open.index}
          ownReviewId={ownReviewId}
          onIndex={(index) => setOpen({ items: open.items, index })}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

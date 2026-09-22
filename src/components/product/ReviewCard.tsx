"use client";

import { useState } from "react";
import { Avatar } from "@/components/account/Avatar";
import { Modal } from "@/components/ui/Modal";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons/ui";
import { Stars } from "@/components/product/Stars";
import type { Review } from "@/lib/db/reviews";

/**
 * One published review, in the shape the client asked for (2026-09-22, with a
 * screenshot of Amazon's): the reviewer's picture and name on top, then the
 * stars, the date, "Verified purchase", the words, and a row of thumbnails.
 *
 * A client component only because of the lightbox — the thumbnails open the
 * review in a pop-up with the media at full size. Everything above them is
 * ordinary markup that would render the same on the server.
 */
export function ReviewCard({ review, mine = false }: { review: Review; mine?: boolean }) {
  const [openAt, setOpenAt] = useState<number | null>(null);

  return (
    <article className="py-6 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <Avatar
          name={review.customerName}
          email={review.customerEmail}
          url={review.customerAvatar}
          size={32}
        />
        <span className="font-medium text-ink">
          {mine ? "You" : review.customerName || "Customer"}
        </span>
        {mine && (
          <span className="border border-line-strong px-1.5 py-0.5 text-[0.625rem] uppercase tracking-wider text-muted">
            Your review
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Stars rating={review.rating} size={15} />
        <span className="text-sm font-medium tabular-nums text-ink">{review.rating}</span>
      </div>

      <p className="mt-1 text-sm text-muted">Reviewed on {formatReviewDate(review.createdAt)}</p>
      <p className="mt-0.5 text-sm font-medium text-accent">Verified purchase</p>

      {review.comment && (
        /* `whitespace-pre-line` so the paragraphs somebody typed survive; the
           text is interpolated, never markup. */
        <p className="mt-3 whitespace-pre-line leading-relaxed text-body">{review.comment}</p>
      )}

      {review.media.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {review.media.map((item, index) => (
            <li key={item.url}>
              <button
                type="button"
                onClick={() => setOpenAt(index)}
                className="relative block border border-line bg-surface-subtle transition-colors hover:border-ink"
                aria-label={`Open ${item.kind === "video" ? "clip" : "photo"} ${index + 1} of ${review.media.length}`}
              >
                {item.kind === "video" ? (
                  <>
                    <video src={item.url} preload="metadata" className="h-24 w-24 object-cover" />
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center text-2xl text-white drop-shadow"
                    >
                      ▶
                    </span>
                  </>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={item.url} alt="" loading="lazy" className="h-24 w-24 object-cover" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {openAt !== null && (
        <ReviewLightbox
          review={review}
          mine={mine}
          index={openAt}
          onIndex={setOpenAt}
          onClose={() => setOpenAt(null)}
        />
      )}
    </article>
  );
}

/**
 * The review, opened: its media large on the left with arrows, the review
 * itself on the right, thumbnails under it.
 *
 * Arrows only when there is more than one file, and they wrap — a two-photo
 * review is the common case and dead-ending on the second is worse than
 * cycling.
 */
function ReviewLightbox({
  review,
  mine,
  index,
  onIndex,
  onClose,
}: {
  review: Review;
  mine: boolean;
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const media = review.media;
  const item = media[index];
  const step = (by: number) => onIndex((index + by + media.length) % media.length);

  return (
    <Modal title={`${mine ? "Your" : `${review.customerName || "Customer"}’s`} review`} onClose={onClose} size="xl">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        {/* **A fixed box, whatever is in it** (client, 2026-09-22): the
            pop-up used to grow and shrink as you stepped from a portrait
            photo to a landscape one, which moved the arrows under the
            pointer. The frame is the constant now and the media is
            `object-contain` inside it, so a tall photo letterboxes rather
            than stretching the panel. */}
        <div className="relative flex h-[44vh] items-center justify-center bg-surface-subtle sm:h-[70vh]">
          {item.kind === "video" ? (
            <video src={item.url} controls autoPlay className="max-h-full max-w-full object-contain" />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={item.url} alt="" className="max-h-full max-w-full object-contain" />
          )}

          {media.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous"
                className="absolute left-2 flex h-9 w-9 items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:border-ink"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next"
                className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:border-ink"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Avatar
              name={review.customerName}
              email={review.customerEmail}
              url={review.customerAvatar}
              size={32}
            />
            <span className="font-medium text-ink">
              {mine ? "You" : review.customerName || "Customer"}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Stars rating={review.rating} size={15} />
            <span className="text-sm font-medium tabular-nums text-ink">{review.rating}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Reviewed on {formatReviewDate(review.createdAt)}
          </p>
          <p className="mt-0.5 text-sm font-medium text-accent">Verified purchase</p>
          {review.comment && (
            <p className="mt-3 max-h-[32vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-body">
              {review.comment}
            </p>
          )}

          {media.length > 1 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {media.map((thumb, i) => (
                <li key={thumb.url}>
                  <button
                    type="button"
                    onClick={() => onIndex(i)}
                    aria-current={i === index}
                    aria-label={`Show ${thumb.kind === "video" ? "clip" : "photo"} ${i + 1}`}
                    className={`block border ${i === index ? "border-ink" : "border-line"} bg-surface-subtle`}
                  >
                    {thumb.kind === "video" ? (
                      <video src={thumb.url} preload="metadata" className="h-14 w-14 object-cover" />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={thumb.url} alt="" className="h-14 w-14 object-cover" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* Fixed locale and time zone, like every other date on the site. */
function formatReviewDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

"use client";

import { useState } from "react";
import { ReviewCard } from "@/components/product/ReviewCard";
import { Stars, formatRating } from "@/components/product/Stars";
import type { RatingSummary, Review } from "@/lib/db/reviews";

/**
 * "Customer reviews": the summary on the left, the reviews on the right
 * (client, 2026-09-22, from a screenshot of Amazon's).
 *
 * **Each star row is a filter.** Clicking "4 star" narrows the list beside it
 * to those reviews; clicking it again, or "All", clears it. A client
 * component for that one piece of state — the cards themselves were already
 * client, for their lightbox.
 *
 * **A half star counts to its nearest whole row**, so a 3.5 sits under 4 and
 * a 2.5 under 3. Five rows read as a shape at a glance; ten would be a table.
 */
export function ReviewsPanel({
  rating,
  reviews,
  ownReviewId,
}: {
  rating: RatingSummary;
  /** Every approved review, plus the reader's own when it is not approved. */
  reviews: Review[];
  ownReviewId: string | null;
}) {
  const [star, setStar] = useState<number | null>(null);

  /* The bars count every rating on the page, including the ones left without
     a comment — they are ratings, and the percentages have to add up. */
  const rows = [5, 4, 3, 2, 1].map((value) => {
    const n = reviews.filter((review) => Math.round(review.rating) === value).length;
    return { star: value, n, percent: reviews.length ? Math.round((n / reviews.length) * 100) : 0 };
  });

  /* Only reviews with words or pictures are listed; a bare rating has
     nothing to show, though it still counts in the figures on the left. */
  const listed = reviews.filter(
    (review) =>
      (review.comment.trim().length > 0 || review.media.length > 0) &&
      (star === null || Math.round(review.rating) === star),
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,19rem)_1fr] lg:gap-0">
      <div className="lg:pr-12">
        <h2 className="text-xl font-semibold text-ink">Customer reviews</h2>

        {rating.count > 0 ? (
          <>
            <div className="mt-2 flex items-center gap-2">
              <Stars rating={rating.average} size={20} />
              <span className="text-lg font-medium text-ink">
                {formatRating(rating.average)} out of 5
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted">
              {rating.count} {rating.count === 1 ? "rating" : "ratings"}
            </p>

            <ul className="mt-5 space-y-1.5">
              {rows.map((row) => {
                const active = star === row.star;
                return (
                  <li key={row.star}>
                    <button
                      type="button"
                      onClick={() => setStar(active ? null : row.star)}
                      aria-pressed={active}
                      disabled={row.n === 0}
                      className="group flex w-full items-center gap-3 text-sm disabled:cursor-default"
                    >
                      <span
                        className={`w-14 shrink-0 text-left tabular-nums ${
                          active ? "font-semibold text-ink" : "text-accent group-hover:underline"
                        } group-disabled:text-muted group-disabled:no-underline`}
                      >
                        {row.star} star
                      </span>
                      <span className="h-4 flex-1 overflow-hidden border border-line-strong bg-surface">
                        <span
                          className="block h-full bg-orange-500"
                          style={{ width: `${row.percent}%` }}
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right tabular-nums text-muted">
                        {row.percent}%
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {star !== null && (
              <button
                type="button"
                onClick={() => setStar(null)}
                className="mt-4 text-sm text-accent hover:underline"
              >
                Show all reviews
              </button>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">No ratings yet</p>
        )}
      </div>

      <div className="border-t border-line pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
        {listed.length === 0 ? (
          <p className="text-body">
            {star !== null
              ? `Nobody who gave ${star} star${star === 1 ? "" : "s"} wrote a review.`
              : rating.count === 0
                ? "No reviews yet. Reviews come from customers who have received this product — you can write one from your order once it arrives."
                : "Nobody has written about this one yet — the rating above is from customers who left stars without a comment."}
          </p>
        ) : (
          <div className="divide-y divide-line">
            {listed.map((review) => (
              <ReviewCard key={review.id} review={review} mine={review.id === ownReviewId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

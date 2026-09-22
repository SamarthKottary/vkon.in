import { ReviewCard } from "@/components/product/ReviewCard";
import { Stars, formatRating } from "@/components/product/Stars";
import type { RatingSummary, Review } from "@/lib/db/reviews";

/**
 * The star line under a product's name — "4.3 ★★★★½ 230 reviews" — and the
 * section it jumps to (client, 2026-09-22, with a screenshot of Amazon's).
 *
 * An anchor rather than a button: it is a link to another part of this page,
 * so it works with no JavaScript, opens in a new tab if somebody middle-clicks
 * it, and the browser handles the scroll.
 */
export function RatingLine({
  rating,
  className = "",
}: {
  rating: RatingSummary;
  className?: string;
}) {
  if (rating.count === 0) {
    return <p className={`text-sm text-muted ${className}`}>No reviews yet</p>;
  }
  return (
    <a
      href="#reviews"
      className={`group inline-flex items-center gap-2 ${className}`}
      aria-label={`Rated ${formatRating(rating.average)} out of 5 from ${rating.count} ${
        rating.count === 1 ? "review" : "reviews"
      }. Read the reviews.`}
    >
      {/* The client's format, from a screenshot: the figure, the stars, then
          how many — no brackets, no word. */}
      <span className="text-lg font-semibold tabular-nums text-ink">
        {formatRating(rating.average)}
      </span>
      <Stars rating={rating.average} size={18} />
      <span className="text-base tabular-nums text-muted group-hover:text-accent group-hover:underline">
        {rating.count}
      </span>
    </a>
  );
}

/**
 * The card's star line: stars, the average, and how many (client, 2026-09-22:
 * "show the product rating on the product cards").
 *
 * **Nothing at all when there are no reviews**, rather than five grey stars
 * and a zero: an empty rating reads as a bad one, and most of a young
 * catalogue has none. Not a link either — the whole card is already one.
 */
export function CardRating({
  rating,
  className = "",
}: {
  rating?: RatingSummary;
  className?: string;
}) {
  if (!rating || rating.count === 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      aria-label={`Rated ${formatRating(rating.average)} out of 5 from ${rating.count} ${
        rating.count === 1 ? "review" : "reviews"
      }`}
    >
      <span className="text-xs font-semibold tabular-nums text-ink">
        {formatRating(rating.average)}
      </span>
      <Stars rating={rating.average} size={13} />
      <span className="text-xs tabular-nums text-muted">{rating.count}</span>
    </span>
  );
}

/**
 * The reviews themselves, at the foot of the product page.
 *
 * Approved ones only — `listApprovedReviews` is the only query that reaches
 * this. Each says who wrote it, in full, as their account names them (the
 * client's choice), and that they bought it: "Verified purchase" is the whole
 * point of tying a review to a delivered order.
 */
export function ProductReviews({
  rating,
  reviews,
  ownReview,
}: {
  rating: RatingSummary;
  reviews: Review[];
  /** The signed-in customer's own review of this product, at any status —
   *  shown to them and to nobody else (client, 2026-09-22). */
  ownReview?: Review | null;
}) {
  /* **Only reviews with something written in them are listed** (client,
     2026-09-22: "don't show just ratings in review sections, only show review
     if there is a review message"). A row of stars with no words says nothing
     a reader can use — but it is still somebody's rating, so it stays in the
     average and the count on the left. */
  /* Words or pictures — a review with a photo and no comment still shows a
     reader something (2026-09-22). Stars alone still does not. */
  const written = reviews.filter(
    (review) => review.comment.trim().length > 0 || review.media.length > 0,
  );
  /* Theirs first, and only once: an approved review is already in the list
     above, where it is shown to everybody. */
  const mine = ownReview && !written.some((review) => review.id === ownReview.id) ? ownReview : null;
  const listed = mine ? [mine, ...written] : written;

  return (
    <section id="reviews" className="scroll-mt-24 border-t border-line py-14 sm:py-16">
      <div className="mx-auto w-full max-w-[75rem] px-5 sm:px-8">
        {/* The summary and the reviews are ruled apart, and so is each review
            from the next (client, 2026-09-22) — the two columns ran together
            as one field of text without it. The rule is on the left edge of
            the right-hand column, so it only exists where there are two
            columns to separate. */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_1fr] lg:gap-0">
          <div className="lg:pr-12">
            <h2 className="label-tech pt-1 text-muted">Reviews</h2>
            {rating.count > 0 && (
              <div className="mt-4">
                <p className="text-3xl font-bold tabular-nums text-ink">
                  {formatRating(rating.average)}
                  <span className="ml-1 text-base font-normal text-muted">out of 5</span>
                </p>
                <Stars rating={rating.average} size={20} className="mt-2" />
                <p className="mt-2 text-sm text-muted">
                  {rating.count} {rating.count === 1 ? "review" : "reviews"}
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-line pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
            {listed.length === 0 ? (
              <p className="text-body">
                {rating.count === 0
                  ? "No reviews yet. Reviews come from customers who have received this product — you can write one from your order once it arrives."
                  : "Nobody has written about this one yet — the rating above is from customers who left stars without a comment."}
              </p>
            ) : (
              <div className="divide-y divide-line">
                {listed.map((review) => (
                  <ReviewCard key={review.id} review={review} mine={review.id === mine?.id} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

import { ReviewsPanel } from "@/components/product/ReviewsPanel";
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
  /* Theirs first, and only once: an approved review is already in the list,
     where it is shown to everybody. */
  const mine = ownReview && !reviews.some((review) => review.id === ownReview.id) ? ownReview : null;
  const all = mine ? [mine, ...reviews] : reviews;

  return (
    <section id="reviews" className="scroll-mt-24 border-t border-line py-14 sm:py-16">
      <div className="mx-auto w-full max-w-[75rem] px-5 sm:px-8">
        <ReviewsPanel rating={rating} reviews={all} ownReviewId={mine?.id ?? null} />
      </div>
    </section>
  );
}

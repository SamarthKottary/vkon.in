import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { InfoNote } from "@/components/admin/InfoNote";
import { ListPager, ListSearch } from "@/components/admin/ListControls";
import { ReviewMediaStrip } from "@/components/product/ReviewMediaStrip";
import { Stars } from "@/components/product/Stars";
import { listHref, listSearch, readListQuery } from "@/lib/admin-list";
import { getAdminSession } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db/client";
import {
  REVIEW_STATUSES,
  countReviewsByStatus,
  listReviewsPage,
  type Review,
  type ReviewStatus,
} from "@/lib/db/reviews";
import { setReviewStatusAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

/**
 * Review moderation (client, 2026-09-22: "these reviews are shown in a
 * separate section called reviews where there will be 3 sections — pending,
 * approved, rejected … all reviews come to pending where admin either rejects
 * or approves the reviews which the public users can see in product details
 * page").
 *
 * **Nothing here is written by the admin**, only judged: the text is the
 * customer's. Every review arrives pending and is invisible to the public
 * until approved; rejecting hides it again, and either can be undone at any
 * time from the other two lists.
 *
 * An edited review comes back to pending by itself — see `saveReview`.
 */
export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string; error?: string }>;
}) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin");
  const canModerate = admin.role === "super" || admin.role === "admin";

  const params = await searchParams;
  const { error } = params;
  const query = readListQuery(params);
  const status = (REVIEW_STATUSES as readonly string[]).includes(params.status ?? "")
    ? (params.status as ReviewStatus)
    : "";
  const [{ reviews, total, page }, counts] = await Promise.all([
    listReviewsPage({ q: query.q, status, page: query.page }),
    countReviewsByStatus(query.q),
  ]);
  const view = listSearch({ q: query.q, status, page });
  const keep = { q: query.q, status };

  const filters: { value: ReviewStatus | ""; label: string; n: number }[] = [
    { value: "", label: "All", n: counts.all },
    { value: "pending", label: "Pending", n: counts.pending },
    { value: "approved", label: "Approved", n: counts.approved },
    { value: "rejected", label: "Rejected", n: counts.rejected },
  ];

  return (
    <Container size="wide">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Reviews</h1>
          <p className="mt-1 text-sm text-muted">
            {counts.all} total ·{" "}
            {counts.pending === 0 ? "none waiting" : `${counts.pending} waiting to be checked`} ·{" "}
            {counts.approved} on the site
          </p>
        </div>

        <ListSearch
          path="/admin/reviews"
          q={query.q}
          placeholder="Product, customer or words in the review"
          label="Search reviews"
          keep={{ status }}
        />
      </div>

      {!isDatabaseConfigured() && (
        <div className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm">
          <p className="font-medium text-ink">No database configured</p>
        </div>
      )}

      {/* Only failures are announced (client, 2026-09-22). A review that has
          just moved says so itself — its badge and its buttons have both
          changed — and a banner for it was one more thing to read past. */}
      {error && (
        <p
          role="status"
          className="mt-6 border-l-2 border-signal-500 bg-surface px-4 py-3 text-sm text-ink"
        >
          Could not change that review.
        </p>
      )}

      <InfoNote title="How this page works">
        <p>
          <span className="font-medium text-ink">Only customers who received the product</span>{" "}
          can write a review: the form appears on their order once it is marked
          delivered, and it is tied to that order. Each gives one to five stars
          and, if they want, a comment.
        </p>
        <p>
          <span className="font-medium text-ink">Nothing is public until you approve it.</span>{" "}
          New reviews land in <span className="font-medium text-ink">Pending</span>.
          Approving puts the review and its stars on the product page;
          rejecting keeps it off. An approved review can be rejected later and
          a rejected one approved, at any time. Nothing is moved back to
          Pending by hand — a customer who edits their review sends it there
          itself.
        </p>
        <p>
          The star figure on a product page is the average of its approved
          reviews only.
        </p>
      </InfoNote>

      <nav aria-label="Filter reviews" className="mt-8 flex flex-wrap gap-2">
        {filters.map((filter) => {
          const current = filter.value === status;
          return (
            <Link
              key={filter.label}
              href={listHref("/admin/reviews", { q: query.q, status: filter.value })}
              aria-current={current ? "page" : undefined}
              className={`inline-flex h-9 items-center gap-2 border px-3 text-sm font-medium transition-colors ${
                current
                  ? "border-ink bg-ink text-surface"
                  : "border-line-strong text-ink hover:border-ink hover:bg-surface-subtle"
              }`}
            >
              {filter.label}
              <span className={`tabular-nums ${current ? "text-surface/80" : "text-muted"}`}>
                {filter.n}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 space-y-4">
        {reviews.length === 0 ? (
          <div className="border border-line bg-surface px-6 py-16 text-center">
            <p className="text-ink">
              {query.q
                ? `No reviews match “${query.q}”.`
                : status === "pending"
                  ? "Nothing is waiting to be checked."
                  : "No reviews yet."}
            </p>
            {!query.q && !status && (
              <p className="mt-1 text-sm text-muted">
                A review can be written once an order is marked delivered.
              </p>
            )}
          </div>
        ) : (
          reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              canModerate={canModerate}
              view={view}
            />
          ))
        )}
        {total > 0 && (
          <div className="border border-line bg-surface">
            <ListPager path="/admin/reviews" page={page} total={total} keep={keep} />
          </div>
        )}
      </div>
    </Container>
  );
}

function ReviewCard({
  review,
  canModerate,
  view,
}: {
  review: Review;
  canModerate: boolean;
  view: string;
}) {
  return (
    <article
      id={`review-${review.id}`}
      className={`scroll-mt-24 border bg-surface p-5 ${
        review.status === "pending" ? "border-line-strong" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Stars rating={review.rating} size={16} />
            <span className="text-sm font-semibold tabular-nums text-ink">{review.rating}/5</span>
            <StatusBadge status={review.status} />
          </div>
          <p className="mt-2 font-medium text-ink">
            <Link href={`/products/${review.productSlug}`} className="hover:text-accent">
              {review.productName}
            </Link>
          </p>
          <p className="mt-1 text-sm text-muted">
            {review.customerName || "Customer"} ·{" "}
            <a href={`mailto:${review.customerEmail}`} className="text-accent hover:underline">
              {review.customerEmail}
            </a>{" "}
            · <span className="font-mono">{review.orderNumber}</span>
          </p>
        </div>

        <p className="label-tech shrink-0 text-muted">{formatDate(review.createdAt)}</p>
      </div>

      {(review.comment || review.media.length > 0) && (
        <div className="mt-4 border-t border-line pt-4">
          {/* The customer's own words, as text — React escapes it. */}
          {review.comment && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-body">
              {review.comment}
            </p>
          )}
          {/* What they attached, shown here because approving a review means
              approving its pictures too (2026-09-22). */}
          {review.media.length > 0 && <ReviewMediaStrip media={review.media} />}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-xs text-muted">
          {review.moderatedBy && review.moderatedAt
            ? `${review.status === "approved" ? "Approved" : "Rejected"} by ${review.moderatedBy} · ${formatDate(review.moderatedAt)}`
            : "Not checked yet"}
          {review.updatedAt !== review.createdAt && ` · edited ${formatDate(review.updatedAt)}`}
        </p>

        {canModerate ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Two ways out of every state and no way back to pending
                (client, 2026-09-22): pending is where a review arrives and
                where an edit returns it, not somewhere to put one. */}
            {review.status !== "approved" && (
              <ModerateButton id={review.id} status="approved" label="Approve" view={view} />
            )}
            {review.status !== "rejected" && (
              <ModerateButton id={review.id} status="rejected" label="Reject" view={view} />
            )}
          </div>
        ) : (
          <p className="text-xs text-muted">Super users and admins can approve or reject.</p>
        )}
      </div>
    </article>
  );
}

function ModerateButton({
  id,
  status,
  label,
  view,
}: {
  id: string;
  status: ReviewStatus;
  label: string;
  view: string;
}) {
  return (
    <form action={setReviewStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="view" value={view} />
      <button
        type="submit"
        className={`inline-flex h-9 items-center border px-3 text-sm font-medium transition-colors ${
          status === "approved"
            ? "border-accent text-accent hover:bg-accent-soft"
            : "border-line-strong text-ink hover:border-ink hover:bg-surface-subtle"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  if (status === "approved") return <Badge tone="brand">Approved</Badge>;
  if (status === "rejected") return <Badge>Rejected</Badge>;
  return <Badge tone="warn">Pending</Badge>;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

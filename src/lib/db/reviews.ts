import { randomUUID } from "node:crypto";
import { isDatabaseConfigured, query } from "./client";
import { PER_PAGE, clampPage, containsPattern } from "@/lib/admin-list";

/**
 * Product reviews: written from a delivered order, moderated in `/admin`,
 * shown on the product page once approved (client, 2026-09-22).
 *
 * **Eligibility is decided here, never by the caller.** `saveReview` looks up
 * the customer's own delivered orders and refuses anything that is not in one
 * of them, so a forged `productId` in the form buys nothing.
 */

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const COMMENT_MIN = 20;
export const COMMENT_MAX = 2000;

/** One photo or clip on a review. The URL is always a `/media/review-…`
 *  file this site stored — `saveReviewAction` refuses anything else. */
export type ReviewMedia = { url: string; kind: "image" | "video" };

export type Review = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  customerId: string;
  /** The reviewer as their account names them (client's choice: in full). */
  customerName: string;
  customerEmail: string;
  /** Their profile picture (`/media/…`), or null for the initial. */
  customerAvatar: string | null;
  orderId: string;
  orderNumber: string;
  rating: number;
  comment: string;
  media: ReviewMedia[];
  status: ReviewStatus;
  moderatedBy: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  product_id: string;
  product_name: string | null;
  product_slug: string | null;
  customer_id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_avatar: string | null;
  order_id: string;
  order_number: string | null;
  rating: number;
  comment: string;
  media: ReviewMedia[] | null;
  status: string;
  moderated_by: string | null;
  moderated_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const SELECT = `r.id, r.product_id, p.name AS product_name, p.slug AS product_slug,
  r.customer_id, c.name AS customer_name, c.email AS customer_email,
  CASE WHEN c.avatar IS NOT NULL AND c.avatar_source <> 'removed'
       THEN '/media/' || c.avatar END AS customer_avatar,
  r.order_id, o.order_number, r.rating, r.comment, r.media, r.status,
  r.moderated_by, r.moderated_at, r.created_at, r.updated_at`;

const FROM = `FROM product_reviews r
  JOIN products p ON p.id = r.product_id
  JOIN customers c ON c.id = r.customer_id
  JOIN orders o ON o.id = r.order_id`;

function mapRow(row: Row): Review {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name ?? "",
    productSlug: row.product_slug ?? "",
    customerId: row.customer_id,
    customerName: row.customer_name ?? "",
    customerEmail: row.customer_email ?? "",
    customerAvatar: row.customer_avatar,
    orderId: row.order_id,
    orderNumber: row.order_number ?? "",
    rating: Number(row.rating),
    comment: row.comment,
    media: Array.isArray(row.media) ? row.media : [],
    status: (REVIEW_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as ReviewStatus)
      : "pending",
    moderatedBy: row.moderated_by,
    moderatedAt: row.moderated_at ? row.moderated_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// The customer's side
// ---------------------------------------------------------------------------

export type SaveReviewResult =
  | { status: "ok"; review: Review }
  /** The order is not this customer's, is not delivered, or does not contain
   *  the product — one answer for all three, because telling them apart tells
   *  a stranger which order ids exist. */
  | { status: "not_allowed" };

/**
 * Writes a review, or replaces the customer's earlier one for that product.
 *
 * **An edit goes back to `pending`** (client, 2026-09-22): the admin sees
 * every version before the public does. `moderated_by`/`moderated_at` are
 * cleared with it, so the trail always describes the text that is live.
 */
export async function saveReview(input: {
  customerId: string;
  orderId: string;
  productId: string;
  rating: number;
  comment: string;
  media: ReviewMedia[];
}): Promise<SaveReviewResult> {
  /* The whole eligibility rule, in the WHERE: this customer's order, that
     order delivered, that product on it. */
  const allowed = await query<{ ok: boolean }>(
    `SELECT TRUE AS ok
       FROM orders o
       JOIN order_items i ON i.order_id = o.id
      WHERE o.id = $1 AND o.customer_id = $2 AND o.status = 'delivered'
        AND i.product_id = $3
      LIMIT 1`,
    [input.orderId, input.customerId, input.productId],
  );
  if (allowed.length === 0) return { status: "not_allowed" };

  /* **Two statements, not one `WITH … RETURNING` wrapped in a SELECT.** A
     statement's own inserts are invisible to the rest of that statement in
     Postgres, so the outer SELECT found nothing on a first review — the row
     was written and the customer was told it had failed, and pressing the
     button again "worked" only because by then the row already existed. */
  const [saved] = await query<{ id: string }>(
    `INSERT INTO product_reviews (id, product_id, customer_id, order_id, rating, comment, media)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (product_id, customer_id) DO UPDATE
       SET rating = EXCLUDED.rating,
           comment = EXCLUDED.comment,
           media = EXCLUDED.media,
           order_id = EXCLUDED.order_id,
           status = 'pending',
           moderated_by = NULL,
           moderated_at = NULL,
           updated_at = now()
     RETURNING id`,
    [
      randomUUID(),
      input.productId,
      input.customerId,
      input.orderId,
      input.rating,
      input.comment,
      JSON.stringify(input.media),
    ],
  );
  const rows = await query<Row>(`SELECT ${SELECT} ${FROM} WHERE r.id = $1`, [saved.id]);
  return { status: "ok", review: mapRow(rows[0]) };
}

/** This customer's reviews for the products on one order, by product id. */
export async function reviewsForOrder(
  customerId: string,
  orderId: string,
): Promise<Map<string, Review>> {
  if (!isDatabaseConfigured()) return new Map();
  try {
    const rows = await query<Row>(
      `SELECT ${SELECT} ${FROM}
        WHERE r.customer_id = $1
          AND r.product_id IN (SELECT product_id FROM order_items WHERE order_id = $2)`,
      [customerId, orderId],
    );
    return new Map(rows.map((row) => [row.product_id, mapRow(row)]));
  } catch (error) {
    console.error("[db] reviews for order failed:", error);
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// The public side — approved reviews only
// ---------------------------------------------------------------------------

export type RatingSummary = { average: number; count: number };

/** The star line on a product page: the average and how many reviews it is
 *  from, counting approved reviews only. `{average: 0, count: 0}` when none. */
export async function productRating(productId: string): Promise<RatingSummary> {
  if (!isDatabaseConfigured()) return { average: 0, count: 0 };
  try {
    const rows = await query<{ average: string | null; count: number }>(
      `SELECT avg(rating)::numeric(3,2) AS average, count(*)::int AS count
         FROM product_reviews WHERE product_id = $1 AND status = 'approved'`,
      [productId],
    );
    return { average: Number(rows[0]?.average ?? 0), count: Number(rows[0]?.count ?? 0) };
  } catch (error) {
    console.error("[db] product rating failed:", error);
    return { average: 0, count: 0 };
  }
}

/** Every product this customer has already reviewed — the order history uses
 *  it to know which lines still need one (2026-09-22). */
export async function reviewedProductIds(customerId: string): Promise<Set<string>> {
  if (!isDatabaseConfigured()) return new Set();
  try {
    const rows = await query<{ product_id: string }>(
      `SELECT product_id FROM product_reviews WHERE customer_id = $1`,
      [customerId],
    );
    return new Set(rows.map((row) => row.product_id));
  } catch (error) {
    console.error("[db] reviewed products failed:", error);
    return new Set();
  }
}

/**
 * The rating a particular visitor should see: the approved average, plus
 * their own review when the admin has not approved it yet (client,
 * 2026-09-22: "even if it approved or not the ratings should also be visible
 * to the customer like the review comment").
 *
 * **Per viewer, and only on the product page.** The figure a stranger sees is
 * the approved one; the writer sees their own star counted in it, the same
 * way they see their own words. The catalogue cards stay on the approved
 * average — they are the same page for everybody, and are cached as such.
 */
export function ratingWithOwn(approved: RatingSummary, own: Review | null): RatingSummary {
  if (!own || own.status === "approved") return approved;
  const count = approved.count + 1;
  return { average: (approved.average * approved.count + own.rating) / count, count };
}

/**
 * This customer's own review of one product, at any status (client,
 * 2026-09-22: "even if the review is in pending, rejected the customer should
 * see his review in product details page").
 *
 * The one read that ignores `status` — it returns a review only to the person
 * who wrote it, which is why it takes a customer id and has no other caller.
 */
export async function ownReviewForProduct(
  customerId: string,
  productId: string,
): Promise<Review | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const rows = await query<Row>(
      `SELECT ${SELECT} ${FROM} WHERE r.customer_id = $1 AND r.product_id = $2`,
      [customerId, productId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (error) {
    console.error("[db] own review failed:", error);
    return null;
  }
}

/** Approved reviews for one product, newest first. */
export async function listApprovedReviews(productId: string, limit = 50): Promise<Review[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const rows = await query<Row>(
      `SELECT ${SELECT} ${FROM}
        WHERE r.product_id = $1 AND r.status = 'approved'
        ORDER BY r.created_at DESC LIMIT $2`,
      [productId, limit],
    );
    return rows.map(mapRow);
  } catch (error) {
    console.error("[db] approved reviews failed:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// The admin's side
// ---------------------------------------------------------------------------

const SEARCH_SQL = `($1 = '' OR p.name ILIKE $2 OR c.name ILIKE $2 OR c.email ILIKE $2
  OR o.order_number ILIKE $2 OR r.comment ILIKE $2)`;

/** One page of reviews for `/admin/reviews`, newest first. */
export async function listReviewsPage(input: {
  q: string;
  status: ReviewStatus | "";
  page: number;
}): Promise<{ reviews: Review[]; total: number; page: number }> {
  if (!isDatabaseConfigured()) return { reviews: [], total: 0, page: 1 };
  try {
    const where = `${SEARCH_SQL} AND ($3 = '' OR r.status = $3)`;
    const args = [input.q, containsPattern(input.q), input.status];
    const [{ n }] = await query<{ n: number }>(
      `SELECT count(*)::int AS n ${FROM} WHERE ${where}`,
      args,
    );
    const page = clampPage(input.page, n);
    const rows = await query<Row>(
      `SELECT ${SELECT} ${FROM} WHERE ${where}
        ORDER BY r.created_at DESC LIMIT $4 OFFSET $5`,
      [...args, PER_PAGE, (page - 1) * PER_PAGE],
    );
    return { reviews: rows.map(mapRow), total: n, page };
  } catch (error) {
    console.error("[db] review page failed:", error);
    return { reviews: [], total: 0, page: 1 };
  }
}

/** How many reviews match the search, per status — the filter's counts. */
export async function countReviewsByStatus(
  q: string,
): Promise<Record<ReviewStatus | "all", number>> {
  const counts = { all: 0, pending: 0, approved: 0, rejected: 0 };
  if (!isDatabaseConfigured()) return counts;
  try {
    const [row] = await query<Record<string, number>>(
      `SELECT count(*)::int AS all,
              count(*) FILTER (WHERE r.status = 'pending')::int  AS pending,
              count(*) FILTER (WHERE r.status = 'approved')::int AS approved,
              count(*) FILTER (WHERE r.status = 'rejected')::int AS rejected
         ${FROM} WHERE ${SEARCH_SQL}`,
      [q, containsPattern(q)],
    );
    for (const key of Object.keys(counts) as (keyof typeof counts)[]) {
      counts[key] = Number(row?.[key] ?? 0);
    }
  } catch (error) {
    console.error("[db] review counts failed:", error);
  }
  return counts;
}

/**
 * Approve or reject one review. Returns the product's slug so the caller can
 * revalidate that page — an approval changes what the public sees.
 *
 * Any status can become any other (client: "in approved and rejected section
 * we can at any time move the reviews to approved/rejected").
 */
export async function setReviewStatus(
  id: string,
  status: ReviewStatus,
  adminEmail: string,
): Promise<{ slug: string } | null> {
  const rows = await query<{ slug: string }>(
    `UPDATE product_reviews r
        SET status = $2, moderated_by = $3, moderated_at = now(), updated_at = now()
       FROM products p
      WHERE r.id = $1 AND p.id = r.product_id
      RETURNING p.slug`,
    [id, status, adminEmail.slice(0, 200)],
  );
  return rows[0] ? { slug: rows[0].slug } : null;
}

/**
 * The same products, each carrying its star figures (2026-09-22).
 *
 * One query for the whole grid rather than one per card, and the products
 * themselves carry the answer — so a card deep inside a client component gets
 * it without every container between having to pass it down.
 *
 * **A signed-in customer's own unapproved ratings are counted in**, exactly
 * as they are on the product page (client, 2026-09-22 — the two disagreeing
 * was the bug). Their review is theirs to see wherever it appears; everybody
 * else gets the approved average. Pass `customerId` on a page that knows who
 * is looking, and nothing extra is queried when nobody is.
 */
export async function withRatings<T extends { id: string }>(
  products: T[],
  customerId?: string | null,
): Promise<(T & { rating: RatingSummary })[]> {
  const [ratings, own] = await Promise.all([
    ratingsForProducts(products.map((product) => product.id)),
    customerId ? ownUnapprovedRatings(customerId) : new Map<string, number>(),
  ]);
  return products.map((product) => {
    const approved = ratings.get(product.id) ?? { average: 0, count: 0 };
    const mine = own.get(product.id);
    return {
      ...product,
      rating:
        mine === undefined
          ? approved
          : {
              count: approved.count + 1,
              average: (approved.average * approved.count + mine) / (approved.count + 1),
            },
    };
  });
}

/** This customer's ratings that the admin has not approved, by product. */
async function ownUnapprovedRatings(customerId: string): Promise<Map<string, number>> {
  if (!isDatabaseConfigured()) return new Map();
  try {
    const rows = await query<{ product_id: string; rating: string }>(
      `SELECT product_id, rating FROM product_reviews
        WHERE customer_id = $1 AND status <> 'approved'`,
      [customerId],
    );
    return new Map(rows.map((row) => [row.product_id, Number(row.rating)]));
  } catch (error) {
    console.error("[db] own unapproved ratings failed:", error);
    return new Map();
  }
}

/** Ratings for many products at once — the catalogue grid's star lines. */
export async function ratingsForProducts(
  productIds: string[],
): Promise<Map<string, RatingSummary>> {
  if (!isDatabaseConfigured() || productIds.length === 0) return new Map();
  try {
    const rows = await query<{ product_id: string; average: string; count: number }>(
      `SELECT product_id, avg(rating)::numeric(3,2) AS average, count(*)::int AS count
         FROM product_reviews
        WHERE status = 'approved' AND product_id = ANY($1::text[])
        GROUP BY product_id`,
      [productIds],
    );
    return new Map(
      rows.map((row) => [row.product_id, { average: Number(row.average), count: Number(row.count) }]),
    );
  } catch (error) {
    console.error("[db] product ratings failed:", error);
    return new Map();
  }
}

/**
 * A small fixed-window rate limiter, in process memory.
 *
 * **This works here because of how the site is deployed**, and that is the
 * whole justification: one Next.js container behind a Cloudflare tunnel, so
 * "in process" and "the whole application" are the same thing. On serverless
 * the identical code would be near useless — each instance keeps its own
 * counter, so N instances means N times the allowance. ARCHITECTURE.md §11
 * records this as the reason login is *not* rate limited: it was written for a
 * serverless target. If this ever moves to one, replace this with a shared
 * store rather than trusting it.
 *
 * The window is fixed rather than sliding, which permits a burst of up to 2×
 * the limit across a window boundary. For stopping a script from filling the
 * subscribers table that is entirely adequate, and it costs one map entry per
 * caller instead of a list of timestamps.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Ceiling on tracked keys, so a flood of distinct addresses cannot grow the map
 * without bound. When it is hit, expired entries are dropped first; if that
 * frees nothing, the map is cleared outright — losing counts is the right
 * failure here, because the alternative is a memory leak reachable by anyone.
 */
const MAX_KEYS = 10_000;

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the window resets. Only meaningful when `ok` is false. */
  retryAfter: number;
};

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) evict(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  return { ok: true, retryAfter: 0 };
}

function evict(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size >= MAX_KEYS) buckets.clear();
}

/**
 * Best-effort client address.
 *
 * Behind the Cloudflare tunnel `cf-connecting-ip` is set by Cloudflare and is
 * the one to trust; `x-forwarded-for` is client-controlled when nothing
 * rewrites it, so it is only a fallback, and only its first entry. A caller who
 * can forge this can spread themselves across buckets — which is why the
 * limiter is a speed bump on abuse, not an access control.
 */
export function clientKey(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return headers.get("x-real-ip")?.trim() || "unknown";
}

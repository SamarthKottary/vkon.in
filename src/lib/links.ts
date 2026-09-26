import { headers } from "next/headers";
import { site } from "@/content/site";

/**
 * The absolute address to put in an email (client, 2026-09-26: a store's
 * "set password" link opened on 404).
 *
 * **Why not always `site.url`.** It is `SITE_URL`, or `https://vkon.in` when
 * that is unset — which is right in production and wrong everywhere else: a
 * link mailed from a laptop points at the live site, where the page being
 * tested does not exist yet. That is the 404.
 *
 * **Why not always the request's own host.** The `Host` header is the client's
 * to set. Trusting it on a public hostname is how a password link gets mailed
 * to a victim pointing at somebody else's domain, token and all — the request
 * carries a real session's email address and an attacker's `Host`.
 *
 * So: the request's origin **only when it is local or on a private network**,
 * which is a developer or somebody on the office LAN and cannot be reached
 * from outside; `site.url` for everything else. Both cases are what the person
 * reading the email actually needs.
 */
const PRIVATE_HOST =
  /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

export async function emailLink(path: string): Promise<string> {
  const base = site.url.replace(/\/$/, "");
  try {
    const incoming = await headers();
    const host = incoming.get("host") ?? "";
    if (PRIVATE_HOST.test(host)) {
      const proto = incoming.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
      return `${proto}://${host}${path}`;
    }
  } catch {
    /* No request context — a job, or a webhook. `site.url` is all there is. */
  }
  return `${base}${path}`;
}

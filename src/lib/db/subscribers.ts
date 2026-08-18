import { isDatabaseConfigured, query } from "./client";
import type { Subscriber } from "@/lib/types";

/**
 * The mailing list. The only module that touches the `subscribers` table.
 *
 * This collects addresses; it does not send anything. Nothing in the codebase
 * mails a subscriber, and adding that later is a decision with obligations
 * attached — see docs/ADMIN.md §7 before wiring up a sender.
 */

type SubscriberRow = {
  id: string;
  email: string;
  source: string;
  created_at: Date;
};

/**
 * Deliberately loose.
 *
 * Real address syntax (RFC 5322) admits things no validator written in a
 * regular expression gets right, and every attempt to be strict about it ends
 * up rejecting somebody's genuine address. The only useful test at this point
 * is "could this plausibly be delivered to" — one @, something either side, a
 * dot in the domain, no whitespace. Whether it accepts mail is answered by
 * sending to it, not by a pattern.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/** Longer than any real address; a cheap bound on what reaches the database. */
const MAX_EMAIL = 254;

export function normaliseEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL || !EMAIL.test(email)) return null;
  return email;
}

function mapRow(row: SubscriberRow): Subscriber {
  return {
    id: row.id,
    email: row.email,
    source: row.source ?? "",
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Adds an address, or does nothing if it is already there.
 *
 * `created` distinguishes the two, for logging and for the admin's counts —
 * but the public panel deliberately says the same thing either way. Telling a
 * stranger "you are already subscribed" turns the form into an oracle for
 * whether a given address is on the list.
 *
 * Throws on a database failure. The caller decides what the visitor sees.
 */
export async function addSubscriber(
  email: string,
  source: string,
): Promise<{ created: boolean }> {
  const rows = await query<{ id: string }>(
    `INSERT INTO subscribers (id, email, source)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [crypto.randomUUID(), email, source.slice(0, 120)],
  );
  return { created: rows.length > 0 };
}

/** Reads fail soft: an admin page with an empty list beats a 500. */
export async function listSubscribers(): Promise<Subscriber[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const rows = await query<SubscriberRow>(
      `SELECT id, email, source, created_at FROM subscribers
       ORDER BY created_at DESC`,
    );
    return rows.map(mapRow);
  } catch (error) {
    console.error("[db] subscriber query failed:", error);
    return [];
  }
}

/** Called only from an authenticated admin action, so it does not swallow errors. */
export async function deleteSubscriber(id: string): Promise<void> {
  await query(`DELETE FROM subscribers WHERE id = $1`, [id]);
}

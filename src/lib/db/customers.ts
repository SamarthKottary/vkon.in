import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { query } from "./client";
import { CONFIRMED_ORDER_SQL } from "@/lib/order-payment";
import type { Customer } from "@/lib/types";

/**
 * Customer accounts and their one-time tokens. The only module that touches
 * `customers`, `customer_sessions` and `customer_tokens`.
 *
 * **Reads here do not fail soft.** Every other `lib/db` module swallows errors
 * and returns an empty list, because an empty catalogue beats a 500 for a
 * visitor. That reasoning inverts for authentication: a database failure
 * during a sign-in must be a failure, never "no such account" and certainly
 * never a session. The callers in `app/(site)/account/actions.ts` catch and
 * turn these into a message.
 *
 * `password_hash` and `google_sub` never leave this file. `mapRow` projects
 * them down to the two booleans `Customer` exposes.
 */

type CustomerRow = {
  id: string;
  email: string;
  name: string;
  phone: string;
  password_hash: string | null;
  google_sub: string | null;
  email_verified: boolean;
  created_at: Date;
};

const SELECT = `id, email, name, phone, password_hash, google_sub, email_verified, created_at`;

function mapRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? "",
    phone: row.phone ?? "",
    emailVerified: row.email_verified,
    hasPassword: Boolean(row.password_hash),
    hasGoogle: Boolean(row.google_sub),
    createdAt: row.created_at.toISOString(),
  };
}

/** The stored hash, for `verifyPassword`. Deliberately a separate call from
 *  `findByEmail` so the hash is fetched only where it is actually compared. */
export async function getPasswordHash(id: string): Promise<string | null> {
  const rows = await query<{ password_hash: string | null }>(
    `SELECT password_hash FROM customers WHERE id = $1`,
    [id],
  );
  return rows[0]?.password_hash ?? null;
}

export async function findCustomerByEmail(email: string): Promise<Customer | null> {
  const rows = await query<CustomerRow>(
    `SELECT ${SELECT} FROM customers WHERE email = $1`,
    [email],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findCustomerById(id: string): Promise<Customer | null> {
  const rows = await query<CustomerRow>(
    `SELECT ${SELECT} FROM customers WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Creates an account.
 *
 * Returns `null` when the email is already taken — `ON CONFLICT DO NOTHING`
 * rather than a SELECT-then-INSERT, because between those two statements two
 * simultaneous registrations both see "free" and the second one crashes on the
 * unique index. The caller turns `null` into a message.
 */
export async function createCustomer(input: {
  email: string;
  name: string;
  phone?: string;
  passwordHash?: string | null;
  googleSub?: string | null;
  emailVerified?: boolean;
}): Promise<Customer | null> {
  const rows = await query<CustomerRow>(
    `INSERT INTO customers (id, email, name, phone, password_hash, google_sub, email_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (email) DO NOTHING
     RETURNING ${SELECT}`,
    [
      randomUUID(),
      input.email,
      input.name,
      input.phone ?? "",
      input.passwordHash ?? null,
      input.googleSub ?? null,
      input.emailVerified ?? false,
    ],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateCustomerProfile(
  id: string,
  input: { name: string; phone: string },
): Promise<void> {
  await query(
    `UPDATE customers SET name = $2, phone = $3, updated_at = now() WHERE id = $1`,
    [id, input.name, input.phone],
  );
}

export async function setCustomerPassword(id: string, hash: string): Promise<void> {
  await query(
    `UPDATE customers SET password_hash = $2, updated_at = now() WHERE id = $1`,
    [id, hash],
  );
}

export async function markEmailVerified(id: string): Promise<void> {
  await query(
    `UPDATE customers SET email_verified = TRUE, updated_at = now() WHERE id = $1`,
    [id],
  );
}

/**
 * Attaches a Google account to an existing row.
 *
 * This is what makes "I registered with a password, then clicked Sign in with
 * Google" land on the same account instead of failing on the unique email
 * index. `google_sub IS NULL` in the WHERE clause means a second Google
 * account cannot quietly take over one that is already linked to a different
 * one.
 */
export async function linkGoogleAccount(
  id: string,
  googleSub: string,
): Promise<void> {
  await query(
    `UPDATE customers
        SET google_sub = $2, email_verified = TRUE, updated_at = now()
      WHERE id = $1 AND google_sub IS NULL`,
    [id, googleSub],
  );
}

export async function findCustomerByGoogleSub(
  sub: string,
): Promise<Customer | null> {
  const rows = await query<CustomerRow>(
    `SELECT ${SELECT} FROM customers WHERE google_sub = $1`,
    [sub],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(input: {
  customerId: string;
  userAgent: string;
  expiresAt: Date;
}): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO customer_sessions (id, customer_id, user_agent, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, input.customerId, input.userAgent.slice(0, 200), input.expiresAt],
  );
  /* For `/admin/users`. Sessions are deleted on logout, so the latest session
     row is not a record of the latest sign-in. */
  await query(`UPDATE customers SET last_sign_in_at = now() WHERE id = $1`, [input.customerId]);
  return id;
}

/**
 * The customer behind a session id, or null.
 *
 * One query, joined, rather than "fetch session then fetch customer" — this
 * runs on every request that renders the header, so it is the one query on the
 * hot path and it is worth keeping to one.
 */
export async function customerForSession(
  sessionId: string,
): Promise<Customer | null> {
  const rows = await query<CustomerRow>(
    `SELECT c.id, c.email, c.name, c.phone, c.password_hash, c.google_sub,
            c.email_verified, c.created_at
       FROM customer_sessions s
       JOIN customers c ON c.id = s.customer_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [sessionId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await query(`DELETE FROM customer_sessions WHERE id = $1`, [sessionId]);
}

/** Signing out everywhere — used after a password reset, so a stolen session
 *  does not survive the recovery that was supposed to end it. */
export async function deleteSessionsForCustomer(customerId: string): Promise<void> {
  await query(`DELETE FROM customer_sessions WHERE customer_id = $1`, [customerId]);
}

/**
 * Opportunistic sweep of expired rows.
 *
 * There is no cron on this deployment, so expiry is enforced by the
 * `expires_at > now()` above and the table is tidied here. Called on a small
 * fraction of session lookups (see `lib/account.ts`), because doing it on
 * every one would add a write to every page render.
 */
export async function sweepExpiredSessions(): Promise<void> {
  await query(`DELETE FROM customer_sessions WHERE expires_at < now()`);
  await query(
    `DELETE FROM customer_tokens WHERE expires_at < now() - interval '7 days'`,
  );
}

// ---------------------------------------------------------------------------
// One-time tokens
// ---------------------------------------------------------------------------

export type TokenKind = "verify" | "reset" | "signin";

/** SHA-256 is right here and wrong for passwords: the input is 32 bytes of
 *  CSPRNG output, so there is no dictionary to run against it and no reason to
 *  pay scrypt's cost on every click of a link. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a token and returns the *plaintext*, which is the only time it
 * exists. Only its hash is stored — see the note in schema.sql.
 */
export async function createToken(input: {
  customerId: string;
  kind: TokenKind;
  ttlMs: number;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await query(
    `INSERT INTO customer_tokens (id, customer_id, kind, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      randomUUID(),
      input.customerId,
      input.kind,
      hashToken(token),
      new Date(Date.now() + input.ttlMs),
    ],
  );
  return token;
}

export type TokenResult =
  | { ok: true; customerId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Consumes a token, atomically.
 *
 * The UPDATE both checks and stamps in one statement, so two clicks arriving
 * together cannot both succeed — the second matches zero rows because
 * `used_at IS NULL` is no longer true. A SELECT followed by an UPDATE would
 * let a double-click reset a password twice, or worse, let a replayed link
 * work after the first use.
 *
 * Failure is then diagnosed with a second, read-only query purely so the page
 * can say "this link has already been used" instead of "invalid".
 */
export async function consumeToken(
  token: string,
  kind: TokenKind,
): Promise<TokenResult> {
  const tokenHash = hashToken(token);

  const claimed = await query<{ customer_id: string }>(
    `UPDATE customer_tokens
        SET used_at = now()
      WHERE token_hash = $1 AND kind = $2
        AND used_at IS NULL AND expires_at > now()
      RETURNING customer_id`,
    [tokenHash, kind],
  );

  if (claimed[0]) return { ok: true, customerId: claimed[0].customer_id };

  const existing = await query<{ used_at: Date | null; expires_at: Date }>(
    `SELECT used_at, expires_at FROM customer_tokens WHERE token_hash = $1 AND kind = $2`,
    [tokenHash, kind],
  );

  if (!existing[0]) return { ok: false, reason: "invalid" };
  if (existing[0].used_at) return { ok: false, reason: "used" };
  return { ok: false, reason: "expired" };
}

/** Invalidates outstanding tokens of one kind — called before issuing a new
 *  one, so "send me another reset link" retires the previous link rather than
 *  leaving several live at once. */
export async function invalidateTokens(
  customerId: string,
  kind: TokenKind,
): Promise<void> {
  await query(
    `UPDATE customer_tokens SET used_at = now()
      WHERE customer_id = $1 AND kind = $2 AND used_at IS NULL`,
    [customerId, kind],
  );
}

// ---------------------------------------------------------------------------
// Sign-in codes
// ---------------------------------------------------------------------------

/** Six digits: long enough that guessing is hopeless against the attempt limit
 *  in `verifySignInCodeAction`, short enough to retype from a phone. */
const CODE_DIGITS = 6;

/**
 * The stored hash of a sign-in code is salted with the customer id.
 *
 * **Not decoration — it is what makes the column usable.** `token_hash` is
 * UNIQUE, and there are only a million six-digit codes, so two customers
 * signing in at once would collide often enough to matter and the second
 * INSERT would fail. Mixing the id in makes the value unique per account, and
 * has the side effect that a code is worthless against any other account.
 */
function hashCode(customerId: string, code: string): string {
  return hashToken(`${customerId}:${code}`);
}

/**
 * Issues a sign-in code, retiring any earlier one for this account, and
 * returns the plaintext — the only moment it exists outside the email.
 */
export async function createSignInCode(input: {
  customerId: string;
  ttlMs: number;
}): Promise<string> {
  await invalidateTokens(input.customerId, "signin");

  /* `randomInt` over the whole range rather than six independent digits: the
     modulo bias of `randomBytes % 10` is small but there is no reason to
     accept it when the unbiased call is the same length. */
  const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");

  await query(
    `INSERT INTO customer_tokens (id, customer_id, kind, token_hash, expires_at)
     VALUES ($1, $2, 'signin', $3, $4)`,
    [
      randomUUID(),
      input.customerId,
      hashCode(input.customerId, code),
      new Date(Date.now() + input.ttlMs),
    ],
  );

  return code;
}

/**
 * Checks and spends a sign-in code in one statement, for the reason
 * `consumeToken` does: two submissions racing must not both succeed.
 *
 * Scoped to the customer the pending challenge names, so a code is only ever
 * valid for the account it was sent to.
 */
export async function consumeSignInCode(
  customerId: string,
  code: string,
): Promise<boolean> {
  const claimed = await query<{ id: string }>(
    `UPDATE customer_tokens
        SET used_at = now()
      WHERE customer_id = $1 AND kind = 'signin' AND token_hash = $2
        AND used_at IS NULL AND expires_at > now()
      RETURNING id`,
    [customerId, hashCode(customerId, code)],
  );
  return claimed.length > 0;
}

// ---------------------------------------------------------------------------
// Trusted devices
// ---------------------------------------------------------------------------

/**
 * The device hash is salted with the customer id, for a reason beyond secrecy.
 *
 * One browser can be used by two people, and `token_hash` is UNIQUE. Hashing
 * the cookie's token alone would let the second account's row collide with the
 * first's and quietly take it over, so the household's other account would be
 * re-challenged every time. Salted, one cookie value maps to one row per
 * account and both stay trusted.
 */
function hashDevice(customerId: string, token: string): string {
  return hashToken(`device:${customerId}:${token}`);
}

/** Records this browser as one the customer has already proved themselves on.
 *  Takes the plaintext id and stores only its hash — see schema.sql. */
export async function trustDevice(input: {
  customerId: string;
  token: string;
  userAgent: string;
  expiresAt: Date;
}): Promise<void> {
  await query(
    `INSERT INTO customer_trusted_devices (id, customer_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (token_hash) DO UPDATE
        SET last_used_at = now(), expires_at = EXCLUDED.expires_at`,
    [
      randomUUID(),
      input.customerId,
      hashDevice(input.customerId, input.token),
      input.userAgent.slice(0, 200),
      input.expiresAt,
    ],
  );
}

/**
 * Whether this browser has been trusted for this account, stamping
 * `last_used_at` if it has.
 *
 * The UPDATE is the check: a row that has expired matches nothing, so an old
 * cookie is indistinguishable from never having been here.
 */
export async function touchTrustedDevice(
  customerId: string,
  token: string,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE customer_trusted_devices
        SET last_used_at = now()
      WHERE customer_id = $1 AND token_hash = $2 AND expires_at > now()
      RETURNING id`,
    [customerId, hashDevice(customerId, token)],
  );
  return rows.length > 0;
}

/** Drops every trusted device for an account, so each browser is challenged
 *  again. Called on a password reset, which is the moment somebody is most
 *  likely to be shutting an intruder out. */
export async function untrustAllDevices(customerId: string): Promise<void> {
  await query(`DELETE FROM customer_trusted_devices WHERE customer_id = $1`, [customerId]);
}

/** Swept opportunistically, the same way expired sessions are. */
export async function sweepExpiredTrustedDevices(): Promise<void> {
  await query(`DELETE FROM customer_trusted_devices WHERE expires_at < now()`);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/**
 * Whether this account signs in without the emailed code. Only a review
 * account should — see `signin_code_exempt` in schema.sql and §9 of
 * ARCHITECTURE.md.
 */
export async function isSigninCodeExempt(customerId: string): Promise<boolean> {
  const rows = await query<{ signin_code_exempt: boolean }>(
    `SELECT signin_code_exempt FROM customers WHERE id = $1`,
    [customerId],
  );
  return rows[0]?.signin_code_exempt === true;
}

/** Called only from an authenticated admin action. */
export async function setSigninCodeExempt(customerId: string, exempt: boolean): Promise<void> {
  await query(
    `UPDATE customers SET signin_code_exempt = $2, updated_at = now() WHERE id = $1`,
    [customerId, exempt],
  );
}

export type AdminCustomer = Customer & {
  signinCodeExempt: boolean;
  lastSignInAt: string | null;
  /** Confirmed orders only, as `/admin/orders` counts them. */
  orderCount: number;
  /** Paise: confirmed, not cancelled, net of refunds. */
  orderTotal: number;
  addressCount: number;
};

/**
 * Every account, newest first, for `/admin/users`.
 *
 * The counts are correlated subqueries rather than joins: joining orders and
 * addresses together multiplies each by the other, and a customer with three
 * orders and two addresses would show six of each. At this shop's size the
 * subqueries cost nothing.
 *
 * `search` matches name, email or phone, case-insensitively. Capped at 500 —
 * past that this page wants paging, and "the newest 500" is still the useful
 * end of the list.
 */
export async function listCustomersForAdmin(search = ""): Promise<AdminCustomer[]> {
  const term = search.trim().slice(0, 100);
  const rows = await query<
    CustomerRow & {
      signin_code_exempt: boolean;
      last_sign_in_at: Date | null;
      order_count: number;
      order_total: string;
      address_count: number;
    }
  >(
    `SELECT ${SELECT}, signin_code_exempt, last_sign_in_at,
            (SELECT count(*) FROM orders o
              WHERE o.customer_id = c.id AND ${CONFIRMED_ORDER_SQL})::int AS order_count,
            (SELECT COALESCE(sum(o.total - o.refunded_amount), 0) FROM orders o
              WHERE o.customer_id = c.id AND o.status <> 'cancelled'
                AND ${CONFIRMED_ORDER_SQL})::bigint AS order_total,
            (SELECT count(*) FROM addresses a WHERE a.customer_id = c.id)::int AS address_count
       FROM customers c
      WHERE $1::text = ''
         OR c.email ILIKE '%' || $1::text || '%'
         OR c.name ILIKE '%' || $1::text || '%'
         OR c.phone ILIKE '%' || $1::text || '%'
      ORDER BY c.created_at DESC
      LIMIT 500`,
    [term],
  );
  return rows.map((row) => ({
    ...mapRow(row),
    signinCodeExempt: row.signin_code_exempt,
    lastSignInAt: row.last_sign_in_at ? row.last_sign_in_at.toISOString() : null,
    orderCount: Number(row.order_count),
    orderTotal: Number(row.order_total),
    addressCount: Number(row.address_count),
  }));
}

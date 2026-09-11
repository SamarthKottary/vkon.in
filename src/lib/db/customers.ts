import { createHash, randomBytes, randomUUID } from "node:crypto";
import { query } from "./client";
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

export type TokenKind = "verify" | "reset";

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

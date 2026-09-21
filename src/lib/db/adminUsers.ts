import { randomUUID } from "node:crypto";
import { query } from "./client";
import type { AdminRole, AdminUser } from "@/lib/types";

/**
 * Database module for the `admin_users` table.
 *
 * The only module that touches it. Same conventions as `lib/db/customers.ts`:
 * snake_case SQL, camelCase application types, one bridge function.
 *
 * `password_hash` never leaves this file — callers get `hasPassword` (bool).
 */

type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string | null;
  avatar: string | null;
  avatar_source: string | null;
  created_at: Date;
};

const SELECT = `id, email, name, role, password_hash, avatar, avatar_source, created_at`;

export const ADMIN_ROLES: AdminRole[] = ["super", "admin", "support", "viewer"];

function mapRow(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? "",
    role: (ADMIN_ROLES.includes(row.role as AdminRole)
      ? row.role
      : "viewer") as AdminRole,
    hasPassword: Boolean(row.password_hash),
    avatarUrl: row.avatar ? `/media/${row.avatar}` : null,
    avatarSource: row.avatar_source ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function findAdminByEmail(email: string): Promise<AdminUser | null> {
  const rows = await query<AdminUserRow>(
    `SELECT ${SELECT} FROM admin_users WHERE email = $1`,
    [email.trim().toLowerCase()],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findAdminById(id: string): Promise<AdminUser | null> {
  const rows = await query<AdminUserRow>(
    `SELECT ${SELECT} FROM admin_users WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Fetches the stored hash for password verification. Never exposed to callers
 *  outside this module beyond `verifyAdminPassword` in `lib/auth.ts`. */
export async function getAdminPasswordHash(id: string): Promise<string | null> {
  const rows = await query<{ password_hash: string | null }>(
    `SELECT password_hash FROM admin_users WHERE id = $1`,
    [id],
  );
  return rows[0]?.password_hash ?? null;
}

/** Every admin user, ordered by role gravity then name, for the access-levels
 *  page. Capped at 200 — a table this size will never need paging. */
export async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await query<AdminUserRow>(
    `SELECT ${SELECT} FROM admin_users
     ORDER BY CASE role
       WHEN 'super'   THEN 1
       WHEN 'admin'   THEN 2
       WHEN 'support' THEN 3
       WHEN 'viewer'  THEN 4
       ELSE 5
     END, name, email
     LIMIT 200`,
    [],
  );
  return rows.map(mapRow);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Creates an admin user with no password set. They must set one on first login.
 *
 * Returns `null` when the email is already taken — the caller turns that into
 * an error message. Uses `ON CONFLICT DO NOTHING` for the same reason
 * `createCustomer` does: a SELECT-then-INSERT race lets two concurrent requests
 * both see "free" and crash the second one on the unique index.
 */
export async function createAdminUser(input: {
  email: string;
  name: string;
  role: AdminRole;
}): Promise<AdminUser | null> {
  const rows = await query<AdminUserRow>(
    `INSERT INTO admin_users (id, email, name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING
     RETURNING ${SELECT}`,
    [randomUUID(), input.email.trim().toLowerCase(), input.name.trim(), input.role],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateAdminProfile(
  id: string,
  input: { name: string },
): Promise<void> {
  await query(
    `UPDATE admin_users SET name = $2, updated_at = now() WHERE id = $1`,
    [id, input.name.trim()],
  );
}

export async function updateAdminRole(id: string, role: AdminRole): Promise<void> {
  await query(
    `UPDATE admin_users SET role = $2, updated_at = now() WHERE id = $1`,
    [id, role],
  );
}

export async function setAdminPassword(id: string, hash: string): Promise<void> {
  await query(
    `UPDATE admin_users SET password_hash = $2, updated_at = now() WHERE id = $1`,
    [id, hash],
  );
}

/**
 * Stores a new avatar filename and returns the previous one (so the caller can
 * delete the old file from disk). The CTE reads the old value before the
 * update so two concurrent saves each get the file the other replaced.
 */
export async function setAdminAvatar(
  id: string,
  avatar: string | null,
  source: "upload" | "removed",
): Promise<string | null> {
  const rows = await query<{ previous: string | null }>(
    `WITH before AS (SELECT avatar FROM admin_users WHERE id = $1)
     UPDATE admin_users
        SET avatar = $2, avatar_source = $3, updated_at = now()
      WHERE id = $1
      RETURNING (SELECT avatar FROM before) AS previous`,
    [id, avatar, source],
  );
  return rows[0]?.previous ?? null;
}

export async function deleteAdminUser(id: string): Promise<void> {
  await query(`DELETE FROM admin_users WHERE id = $1`, [id]);
}

import { Pool } from "pg";

/**
 * Postgres connection pool.
 *
 * `pg` rather than a Neon-specific driver so the same code runs against a local
 * Postgres in development and against Neon, Supabase or any managed Postgres in
 * production. On serverless, point DATABASE_URL at the provider's *pooled*
 * (pgbouncer) connection string — a per-instance pool against a direct
 * connection will exhaust the server's connection limit.
 *
 * The pool is cached on globalThis so Next's dev-mode module reloading does not
 * open a new pool on every edit.
 */

declare global {
  var __vkonPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in, " +
        "then run `npm run db:setup`.",
    );
  }

  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: sslOption(connectionString),
  });
}

/**
 * Whether to negotiate TLS to Postgres.
 *
 * This was first written as "SSL unless the host is localhost", which broke the
 * moment the app moved into Docker: the database host became `db`, so the
 * driver demanded TLS from a container that does not offer it and every query
 * failed with "The server does not support SSL connections".
 *
 * The rule is now explicit rather than guessed:
 *   1. DATABASE_SSL=require|true  → on;  =disable|false → off
 *   2. otherwise honour `?sslmode=` in the connection string
 *   3. otherwise OFF — the default deployment is app and database on a private
 *      Docker network, where TLS adds nothing. Managed providers (Neon,
 *      Supabase) all put `?sslmode=require` in the URL they give you, so they
 *      are covered by rule 2.
 */
function sslOption(connectionString: string) {
  const on = { rejectUnauthorized: false } as const;

  const flag = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (flag) {
    if (["require", "true", "1", "on", "prefer"].includes(flag)) return on;
    if (["disable", "false", "0", "off"].includes(flag)) return undefined;
  }

  const mode = /[?&]sslmode=([a-z-]+)/i.exec(connectionString)?.[1]?.toLowerCase();
  if (mode) return mode === "disable" ? undefined : on;

  return undefined;
}

export function getPool(): Pool {
  if (!globalThis.__vkonPool) {
    globalThis.__vkonPool = createPool();
  }
  return globalThis.__vkonPool;
}

/** True when a database is configured. Lets pages degrade instead of crashing. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

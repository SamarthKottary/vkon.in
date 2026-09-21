import { isDatabaseConfigured, query } from "./client";
import type { Enquiry } from "@/lib/types";
import { PER_PAGE, clampPage, containsPattern, phoneDigits } from "@/lib/admin-list";

/**
 * Contact enquiries. The only module that touches the `enquiries` table.
 *
 * As with `subscribers`, this stores and reads — nothing in the codebase mails
 * anybody. The row is the enquiry. That means **an enquiry sits unseen until
 * someone opens /admin/enquiries**, which is a real gap rather than a detail;
 * docs/ADMIN.md §7.7 records it and what closing it would take. The contact
 * page keeps phone and WhatsApp above the form for exactly that reason.
 */

type EnquiryRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  source: string;
  handled: boolean;
  created_at: Date;
};

const SELECT = `id, name, email, phone, message, source, handled, created_at`;

function mapRow(row: EnquiryRow): Enquiry {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? "",
    message: row.message,
    source: row.source ?? "",
    handled: row.handled,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createEnquiry(input: {
  name: string;
  email: string;
  phone: string;
  message: string;
  source: string;
}): Promise<void> {
  await query(
    `INSERT INTO enquiries (id, name, email, phone, message, source)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      crypto.randomUUID(),
      input.name,
      input.email,
      input.phone,
      input.message,
      input.source.slice(0, 120),
    ],
  );
}

/**
 * One page of `/admin/enquiries` — unhandled first, then newest — optionally
 * narrowed by name, email or phone (2026-09-19). A phone search matches on
 * digits, so "82170 86719" finds "+91 8217086719". Clamped to the last page;
 * fails soft.
 */
export async function listEnquiriesPage(input: {
  q: string;
  page: number;
}): Promise<{ rows: Enquiry[]; total: number; page: number }> {
  if (!isDatabaseConfigured()) return { rows: [], total: 0, page: 1 };
  try {
    const where = `($1 = '' OR name ILIKE $2 OR email ILIKE $2
      OR ($3 <> '' AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || $3 || '%'))`;
    const args = [input.q, containsPattern(input.q), phoneDigits(input.q)];
    const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM enquiries WHERE ${where}`, args);
    const page = clampPage(input.page, n);
    const rows = await query<EnquiryRow>(
      `SELECT ${SELECT} FROM enquiries WHERE ${where}
        ORDER BY handled ASC, created_at DESC LIMIT $4 OFFSET $5`,
      [...args, PER_PAGE, (page - 1) * PER_PAGE],
    );
    return { rows: rows.map(mapRow), total: n, page };
  } catch (error) {
    console.error("[db] enquiry page query failed:", error);
    return { rows: [], total: 0, page: 1 };
  }
}

/** All enquiries, and how many are unhandled — the page header, without
 *  loading every row now that the list is paged. */
export async function enquiryCounts(): Promise<{ total: number; open: number }> {
  if (!isDatabaseConfigured()) return { total: 0, open: 0 };
  try {
    const [row] = await query<{ total: number; open: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT handled)::int AS open FROM enquiries`,
    );
    return row;
  } catch (error) {
    console.error("[db] enquiry counts failed:", error);
    return { total: 0, open: 0 };
  }
}

/** Called only from authenticated admin actions, so it does not swallow errors. */
export async function setEnquiryHandled(
  id: string,
  handled: boolean,
): Promise<void> {
  await query(`UPDATE enquiries SET handled = $2 WHERE id = $1`, [id, handled]);
}

export async function deleteEnquiry(id: string): Promise<void> {
  await query(`DELETE FROM enquiries WHERE id = $1`, [id]);
}

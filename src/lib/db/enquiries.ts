import { isDatabaseConfigured, query } from "./client";
import type { Enquiry } from "@/lib/types";

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

/** Reads fail soft: an admin page with an empty inbox beats a 500. */
export async function listEnquiries(): Promise<Enquiry[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const rows = await query<EnquiryRow>(
      `SELECT ${SELECT} FROM enquiries ORDER BY handled ASC, created_at DESC`,
    );
    return rows.map(mapRow);
  } catch (error) {
    console.error("[db] enquiry query failed:", error);
    return [];
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

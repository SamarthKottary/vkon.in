import { isDatabaseConfigured, query } from "./client";
import { PROTECTION_KEYS } from "@/content/taxonomy";
import type {
  Product,
  ProductCategory,
  ProductImage,
  ProductInput,
  ProtectionKey,
  SpecRow,
} from "@/lib/types";

/**
 * Product data access. The only module that talks to the products table.
 *
 * Every read is wrapped so a missing or unreachable database renders an empty
 * catalogue rather than a 500. For a brochure site a page that says "no
 * products yet" is strictly better than an error page, and it lets the site be
 * cloned and run before any database exists.
 */

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  hp_ranges: string[];
  features: string[];
  protections: string[];
  spec: unknown;
  images: unknown;
  video_url: string | null;
  video_title: string | null;
  published: boolean;
  featured: boolean;
  sort_order: number;
  seo_title: string;
  seo_description: string;
  created_at: Date;
  updated_at: Date;
};

const SELECT_COLUMNS = `
  id, slug, name, category, tagline, description,
  hp_ranges, features, protections, spec, images,
  video_url, video_title, published, featured, sort_order,
  seo_title, seo_description,
  created_at, updated_at
`;

function asSpec(value: unknown): SpecRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const { label, value: v } = row as Record<string, unknown>;
    if (typeof label !== "string" || typeof v !== "string") return [];
    if (!label.trim() && !v.trim()) return [];
    return [{ label, value: v }];
  });
}

function asImages(value: unknown): ProductImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const { url, alt, pathname } = row as Record<string, unknown>;
    if (typeof url !== "string" || !url) return [];
    return [
      {
        url,
        alt: typeof alt === "string" ? alt : "",
        ...(typeof pathname === "string" ? { pathname } : {}),
      },
    ];
  });
}

/** Drops keys that are no longer in the taxonomy instead of rendering blanks. */
function asProtections(value: string[] | null): ProtectionKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter((k): k is ProtectionKey =>
    (PROTECTION_KEYS as readonly string[]).includes(k),
  );
}

function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category as ProductCategory,
    tagline: row.tagline ?? "",
    description: row.description ?? "",
    images: asImages(row.images),
    videoUrl: row.video_url,
    videoTitle: row.video_title,
    hpRanges: row.hp_ranges ?? [],
    features: row.features ?? [],
    protections: asProtections(row.protections),
    spec: asSpec(row.spec),
    published: row.published,
    featured: row.featured,
    sortOrder: row.sort_order,
    seoTitle: row.seo_title ?? "",
    seoDescription: row.seo_description ?? "",
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Reads return empty rather than throwing when the DB is absent or down. */
async function safeQuery(text: string, params: unknown[] = []) {
  if (!isDatabaseConfigured()) return [];
  try {
    return await query<ProductRow>(text, params);
  } catch (error) {
    console.error("[db] product query failed:", error);
    return [];
  }
}

export async function listProducts({
  includeUnpublished = false,
}: { includeUnpublished?: boolean } = {}): Promise<Product[]> {
  const where = includeUnpublished ? "" : "WHERE published = TRUE";
  const rows = await safeQuery(
    `SELECT ${SELECT_COLUMNS} FROM products ${where}
     ORDER BY sort_order ASC, created_at DESC`,
  );
  return rows.map(mapProductRow);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const rows = await safeQuery(
    `SELECT ${SELECT_COLUMNS} FROM products WHERE slug = $1 AND published = TRUE LIMIT 1`,
    [slug],
  );
  return rows[0] ? mapProductRow(rows[0]) : null;
}

export async function getProductById(id: string): Promise<Product | null> {
  const rows = await safeQuery(
    `SELECT ${SELECT_COLUMNS} FROM products WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ? mapProductRow(rows[0]) : null;
}

export async function listFeaturedProducts(limit = 3): Promise<Product[]> {
  const rows = await safeQuery(
    `SELECT ${SELECT_COLUMNS} FROM products
     WHERE published = TRUE AND featured = TRUE
     ORDER BY sort_order ASC, created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map(mapProductRow);
}

// ---------------------------------------------------------------------------
// Writes. These are called only from authenticated admin server actions, and
// they deliberately do NOT swallow errors — the admin needs to see failures.
// ---------------------------------------------------------------------------

const WRITE_VALUES = `
  slug = $2, name = $3, category = $4, tagline = $5, description = $6,
  hp_ranges = $7, features = $8, protections = $9, spec = $10, images = $11,
  video_url = $12, video_title = $13, published = $14, featured = $15,
  sort_order = $16, seo_title = $17, seo_description = $18, updated_at = now()
`;

function writeParams(input: ProductInput): unknown[] {
  return [
    input.slug,
    input.name,
    input.category,
    input.tagline,
    input.description,
    input.hpRanges,
    input.features,
    input.protections,
    JSON.stringify(input.spec),
    JSON.stringify(input.images),
    input.videoUrl,
    input.videoTitle,
    input.published,
    input.featured,
    input.sortOrder,
    input.seoTitle,
    input.seoDescription,
  ];
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const id = crypto.randomUUID();
  const rows = await query<ProductRow>(
    `INSERT INTO products (
       id, slug, name, category, tagline, description,
       hp_ranges, features, protections, spec, images,
       video_url, video_title, published, featured, sort_order,
       seo_title, seo_description
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING ${SELECT_COLUMNS}`,
    [id, ...writeParams(input)],
  );
  return mapProductRow(rows[0]);
}

export async function updateProduct(
  id: string,
  input: ProductInput,
): Promise<Product | null> {
  const rows = await query<ProductRow>(
    `UPDATE products SET ${WRITE_VALUES} WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
    [id, ...writeParams(input)],
  );
  return rows[0] ? mapProductRow(rows[0]) : null;
}

export async function deleteProduct(id: string): Promise<Product | null> {
  const rows = await query<ProductRow>(
    `DELETE FROM products WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
    [id],
  );
  return rows[0] ? mapProductRow(rows[0]) : null;
}

/** True if another product already uses this slug. */
export async function slugExists(slug: string, exceptId?: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    exceptId
      ? `SELECT id FROM products WHERE slug = $1 AND id <> $2 LIMIT 1`
      : `SELECT id FROM products WHERE slug = $1 LIMIT 1`,
    exceptId ? [slug, exceptId] : [slug],
  );
  return rows.length > 0;
}

/** One past the highest `sort_order` in use, so a new product is appended
 *  after the last one in the admin list rather than landing at 0 and jumping
 *  ahead of everything already arranged there. */
export async function nextSortOrder(): Promise<number> {
  const rows = await query<{ max: number | null }>(
    `SELECT MAX(sort_order) AS max FROM products`,
  );
  return (rows[0]?.max ?? -1) + 1;
}

/** Persists the admin list's drag order as `sort_order` — 0 for the first id,
 *  counting up. One statement rather than one `UPDATE` per product: `unnest`
 *  zips the id and position arrays into rows and joins them back in, so the
 *  whole reorder commits atomically instead of leaving the list half-written
 *  if a later id in a per-row loop failed. */
export async function reorderProducts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await query(
    `UPDATE products AS p
     SET sort_order = data.ord, updated_at = now()
     FROM (
       SELECT id, ord FROM unnest($1::uuid[], $2::int[]) AS t(id, ord)
     ) AS data
     WHERE p.id = data.id`,
    [ids, ids.map((_, index) => index)],
  );
}

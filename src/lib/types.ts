/**
 * Shared content types.
 *
 * Products are stored in Postgres and edited through the admin at /admin, so
 * these types describe rows rather than a hand-authored file. Column names are
 * snake_case in SQL and camelCase here; `mapProductRow` in `lib/db/products.ts`
 * is the only place that bridges the two.
 */

/** Keys into the protection icon set in `src/components/icons/protections.tsx`. */
export type ProtectionKey =
  | "rotary-lock"
  | "auto-start-timer"
  | "cyclic-timer"
  | "hv-lv"
  | "voltage-current-sensing"
  | "single-phase"
  | "overload-relay"
  | "dry-run"
  | "phase-reversal"
  | "star-delta"
  | "mobile-control"
  | "solar-powered";

export type ProductCategory =
  | "starter"
  | "solar"
  | "auto-start"
  | "cable"
  | "accessory";

export type ProductImage = {
  url: string;
  alt: string;
  /** Vercel Blob key, retained so deleting a product also deletes its files. */
  pathname?: string;
};

export type SpecRow = {
  label: string;
  value: string;
};

export type Product = {
  id: string;
  /** URL segment — `"ec-dol"` renders at `/products/ec-dol`. */
  slug: string;
  name: string;
  category: ProductCategory;
  /** One line, shown on the catalogue card. */
  tagline: string;
  /** Long copy. Blank lines separate paragraphs. */
  description: string;
  images: ProductImage[];
  /** YouTube or Vimeo URL; parsed to an embed by `lib/video.ts`. */
  videoUrl: string | null;
  videoTitle: string | null;
  hpRanges: string[];
  features: string[];
  protections: ProtectionKey[];
  spec: SpecRow[];
  published: boolean;
  featured: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** The shape the admin form submits. `id` absent means create. */
export type ProductInput = Omit<Product, "id" | "createdAt" | "updatedAt">;

export type CategoryMeta = {
  key: ProductCategory;
  label: string;
  description: string;
  /**
   * Optional card image, e.g. "/categories/starter.jpg" in `public/`. Meant to
   * be the category's products laid out together on a bench. Omit it and the
   * card falls back to a line drawing, so a missing file is never a broken
   * layout.
   */
  image?: string;
};

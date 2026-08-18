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

/**
 * Top-level market sector. The three the hero rotates through, and the three
 * cards in "What we make".
 *
 * A sector is not stored on a product. A product has a category, and a category
 * belongs to exactly one sector — so the sector is derived, and moving a whole
 * range from one sector to another is a one-line edit in `taxonomy.ts` rather
 * than a database migration. See `sectorOf()` there.
 */
export type Sector = "agriculture" | "industrial" | "commercial";

/**
 * A product's category — the sub-category under a sector.
 *
 * The first five are agriculture, which is the whole shipping range today. The
 * last two exist so the other two sectors are not empty shells; both are marked
 * placeholder in `taxonomy.ts`.
 */
export type ProductCategory =
  | "starter"
  | "solar"
  | "auto-start"
  | "cable"
  | "accessory"
  | "industrial-panel"
  | "home-automation";

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
  /** Which sector's card this category appears under. */
  sector: Sector;
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

export type SectorMeta = {
  key: Sector;
  label: string;
  /** One line under the card heading, and the hero slide's supporting copy. */
  description: string;
  /**
   * Hero artwork: a full-bleed establishing shot, composed with its subject in
   * the right third and its left kept quiet for the headline.
   */
  image?: string;
  /**
   * Card artwork, when the hero frame does not survive being shrunk.
   *
   * Falls back to `image`, and sharing one picture is still the default — it is
   * what ties the rotating hero to the cards a screen below it. But the two
   * framings want different things: a hero is 1440px of establishing shot,
   * a card is 352px, and a wide vista at that size is a small grey rectangle
   * with a subject you cannot make out. Set this to a tighter crop of the same
   * scene when that happens.
   */
  cardImage?: string;
};

/**
 * One address on the mailing list.
 *
 * Not a product of the admin form — visitors create these from the panel above
 * the footer, and the admin only reads and deletes them.
 */
export type Subscriber = {
  id: string;
  /** Stored lower-cased and trimmed; see `lib/db/subscribers.ts`. */
  email: string;
  /** Path the address was submitted from, e.g. "/products". May be empty. */
  source: string;
  createdAt: string;
};

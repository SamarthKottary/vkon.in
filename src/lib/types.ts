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
  /**
   * List price ("M.R.P.") in INR, whole rupees. Null if not set.
   *
   * This is the price *before* any discount, which is why the struck-through
   * figure on a card is this one. What the customer pays is derived from it
   * and `discountPercent` — see `components/product/ProductPrice`.
   */
  price: number | null;
  /**
   * Reduction off `price`, as a whole percentage 0-99. Null or 0 means the
   * product is simply sold at `price` and no discount is shown at all.
   *
   * Stored rather than the selling price so the percentage the customer is
   * shown is the one that was entered, not one reconstructed from a rounded
   * figure — and so the two can never drift apart.
   */
  discountPercent: number | null;
  /** Optional meta-title override; blank falls back to the product name. */
  seoTitle: string;
  /** Optional meta-description override; blank falls back to the tagline. */
  seoDescription: string;
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

/**
 * One contact enquiry.
 *
 * Created by visitors from /contact; the admin only reads, marks handled and
 * deletes. `handled` is a flag rather than a deletion because a dealt-with
 * enquiry is still a record of who asked for what and when.
 */
export type Enquiry = {
  id: string;
  name: string;
  email: string;
  /** Optional — may be an empty string. */
  phone: string;
  message: string;
  /** Path the enquiry was sent from. May be empty. */
  source: string;
  handled: boolean;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Customer accounts, addresses and orders.
//
// Added 2026-09-06. Same convention as the product types above: snake_case in
// SQL, camelCase here, bridged in exactly one place per table inside
// `lib/db/`.
// ---------------------------------------------------------------------------

export type Customer = {
  id: string;
  email: string;
  name: string;
  phone: string;
  /** True once the welcome-mail link has been followed, or immediately for a
   *  Google sign-in. Nothing is gated on it yet — see ARCHITECTURE.md §7a. */
  emailVerified: boolean;
  /** Whether a password is set at all. The hash itself never leaves `lib/db`. */
  hasPassword: boolean;
  /** Whether this account is linked to Google. The `sub` itself is not exposed. */
  hasGoogle: boolean;
  createdAt: string;
};

export type Address = {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /**
   * GST registration number, or "" for the overwhelming majority who have
   * none. Optional everywhere, upper-cased on save, and never an input to what
   * is charged -- see the note on the column in schema.sql.
   */
  gstin: string;
  isDefault: boolean;
};

/** The address as it was when the order was placed. See the `ship_to` note in
 *  schema.sql: an order snapshots, it does not reference. */
export type ShipTo = Omit<Address, "id" | "isDefault">;

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "cancelled";

export type PaymentStatus = "unpaid" | "paid" | "failed" | "refunded";

export type OrderItem = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string;
  /** Paise. Divide by 100 exactly once, at render time. */
  unitPrice: number;
  qty: number;
  lineTotal: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  customerId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** Every one of these is paise. See the note on `orders` in schema.sql. */
  subtotal: number;
  cgst: number;
  sgst: number;
  shipping: number;
  total: number;
  currency: string;
  shipTo: ShipTo;
  /** Whom it is invoiced to. Equal to `shipTo` when checkout's "ship to the
   *  billing address" box was left ticked, which is the common case. */
  billTo: ShipTo;
  notes: string;
  paymentProvider: string | null;
  paymentOrderId: string | null;
  paymentId: string | null;
  paidAt: string | null;
  createdAt: string;
  items: OrderItem[];
};

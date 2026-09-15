import type { Product, ProductCategory } from "@/lib/types";

/**
 * What a parcel weighs and measures, and how several of them pack into one box.
 *
 * Separate from `lib/shiprocket.ts` on purpose: that module is about somebody
 * else's API, this one is about *our* products. Nothing here knows a courier
 * exists, which is what lets it be reasoned about — and corrected — without
 * touching the integration.
 *
 * ## Why dimensions are here at all
 *
 * A courier bills on the **greater** of actual weight and *volumetric* weight,
 * where volumetric is `L × B × H / 5000` in centimetres and kilograms. That
 * divisor is the Indian surface standard and is what Delhivery, DTDC and Blue
 * Dart all use.
 *
 * This is not a rounding detail. Measured against the live Shiprocket API on
 * 2026-09-12, the same 2 kg parcel quoted:
 *
 * | Declared box | Rate | Couriers willing |
 * |---|---|---|
 * | none / 15×15×15 | ₹128.36 | 6 |
 * | 40×40×40 | ₹459.66 | 2 |
 * | 60×60×60 | ₹1,442.68 | 1 |
 *
 * Eleven times the price for the identical weight — and the courier *list*
 * shrinks too, because size gates who will carry it at all. Quoting without
 * dimensions means quoting the cheapest of those and being billed one of the
 * others after the customer has paid.
 */

/** The divisor every major Indian surface courier uses for volumetric weight,
 *  with lengths in centimetres and the result in kilograms. */
const VOLUMETRIC_DIVISOR = 5000;

export type ParcelSpec = {
  weightGrams: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};

/**
 * Packed estimates per category, used for any product that has not been
 * measured yet.
 *
 * **These are estimates, and they are meant to be replaced.** They exist so
 * that an unmeasured catalogue quotes *plausibly* rather than quoting a
 * shoebox for everything — the previous behaviour, a flat 2 kg with no
 * dimensions, under-quoted every panel on the site.
 *
 * They are per category rather than one global default because the categories
 * genuinely differ by an order of magnitude: an industrial panel is thirty
 * times an accessory. Getting the category right is most of the accuracy, and
 * costs nothing to maintain.
 *
 * Each is the **packed** figure — the box, not the bare product. Every one is
 * deliberately set so actual weight exceeds volumetric weight, which is true
 * of electrical goods generally; if a real measurement turns out lighter and
 * bulkier than this, the volumetric branch in `chargeableGrams` takes over on
 * its own.
 *
 * Replace them by entering real values per product in `/admin/products`. A
 * product with its own weight *and* dimensions never consults this table.
 */
export const CATEGORY_PARCEL: Record<ProductCategory, ParcelSpec> = {
  starter: { weightGrams: 3500, lengthCm: 28, breadthCm: 20, heightCm: 14 },
  "auto-start": { weightGrams: 2500, lengthCm: 24, breadthCm: 18, heightCm: 12 },
  solar: { weightGrams: 5000, lengthCm: 35, breadthCm: 26, heightCm: 18 },
  cable: { weightGrams: 6000, lengthCm: 30, breadthCm: 30, heightCm: 14 },
  accessory: { weightGrams: 500, lengthCm: 16, breadthCm: 12, heightCm: 8 },
  "industrial-panel": { weightGrams: 15000, lengthCm: 60, breadthCm: 45, heightCm: 25 },
  "home-automation": { weightGrams: 700, lengthCm: 20, breadthCm: 14, heightCm: 8 },
};

/** The last resort, for a category that does not appear above — which can only
 *  happen if one is added to the taxonomy and not to this table. Sized as the
 *  most common category rather than as something tiny, so the failure mode is
 *  an over-quote rather than a silent loss. */
const FALLBACK: ParcelSpec = CATEGORY_PARCEL.starter;

/**
 * One product's parcel: its own measurements where they exist, the category
 * estimate where they do not.
 *
 * **Weight and dimensions fall back independently.** Somebody who has put a
 * scale under a panel but not a tape measure gets their real weight and an
 * estimated box, which is better than throwing away the measurement they took.
 */
export function productParcel(product: {
  category: ProductCategory;
  weightGrams: number | null;
  lengthCm: number | null;
  breadthCm: number | null;
  heightCm: number | null;
}): ParcelSpec {
  const base = CATEGORY_PARCEL[product.category] ?? FALLBACK;

  /* All three dimensions or none: a box with a measured length and an
     estimated width is not a box anybody measured, and mixing them produces a
     volume that is not the product's. */
  const measured =
    product.lengthCm && product.breadthCm && product.heightCm
      ? {
          lengthCm: product.lengthCm,
          breadthCm: product.breadthCm,
          heightCm: product.heightCm,
        }
      : { lengthCm: base.lengthCm, breadthCm: base.breadthCm, heightCm: base.heightCm };

  return {
    weightGrams:
      product.weightGrams && product.weightGrams > 0
        ? product.weightGrams
        : base.weightGrams,
    ...measured,
  };
}

/** Whether every product in the cart has been measured, rather than estimated.
 *  Drives the "these are estimates" note in the admin, and nothing else. */
export function isFullyMeasured(products: Product[]): boolean {
  return products.every(
    (p) => p.weightGrams && p.lengthCm && p.breadthCm && p.heightCm,
  );
}

/**
 * Several items as one box.
 *
 * **Stacked, not laid side by side.** The footprint is the largest single
 * item's length and breadth; the height is whatever the total volume needs on
 * that footprint, and never less than the tallest item. That models a carton
 * with things piled in it, which is how these actually go out, and it is
 * stable: adding a small item to a big one grows the height a little rather
 * than doubling a dimension.
 *
 * It is an approximation either way — real packing is a solver — and it errs
 * slightly high, because stacked items never interlock as well as the volume
 * arithmetic assumes. That is the right direction: see the note on
 * `CATEGORY_PARCEL`.
 */
export function packParcel(
  lines: { slug: string; qty: number }[],
  products: Product[],
): ParcelSpec {
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  let weightGrams = 0;
  let volumeCm3 = 0;
  let lengthCm = 0;
  let breadthCm = 0;
  let tallestCm = 0;

  for (const line of lines) {
    const product = bySlug.get(line.slug);
    if (!product) continue;

    const parcel = productParcel(product);
    const qty = Math.max(1, line.qty);

    weightGrams += parcel.weightGrams * qty;
    volumeCm3 += parcel.lengthCm * parcel.breadthCm * parcel.heightCm * qty;
    lengthCm = Math.max(lengthCm, parcel.lengthCm);
    breadthCm = Math.max(breadthCm, parcel.breadthCm);
    tallestCm = Math.max(tallestCm, parcel.heightCm);
  }

  /* An empty or wholly unresolvable cart. The caller has nothing to quote, but
     returning zeroes would send `weight=0` to a courier API, so this returns
     the fallback box rather than something impossible. */
  if (weightGrams === 0) return { ...FALLBACK };

  const footprint = lengthCm * breadthCm;
  const heightCm = Math.max(tallestCm, Math.ceil(volumeCm3 / footprint));

  return { weightGrams, lengthCm, breadthCm, heightCm };
}

/** Volumetric weight in grams — the box's size expressed as what a courier
 *  will bill it as. */
export function volumetricGrams(parcel: ParcelSpec): number {
  return Math.round(
    ((parcel.lengthCm * parcel.breadthCm * parcel.heightCm) / VOLUMETRIC_DIVISOR) * 1000,
  );
}

/** What the courier actually charges on: the greater of the two. Exported
 *  mainly so the admin can show it — the quote sends real dimensions and lets
 *  Shiprocket do this sum itself, since size also decides *which* couriers
 *  will take the parcel and that cannot be reduced to one number. */
export function chargeableGrams(parcel: ParcelSpec): number {
  return Math.max(parcel.weightGrams, volumetricGrams(parcel));
}

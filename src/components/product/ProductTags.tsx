import type { Product } from "@/lib/types";

/**
 * The tags over a product photo: Out of stock, Best seller, Limited time deal
 * (client, 2026-09-22 — "1. Out of stock - red, 2. Best seller - green,
 * 3. Limited time deal - orange").
 *
 * **A folded ribbon across the top-right corner of the photo** (client,
 * 2026-09-22). `pointer-events-none` throughout: every card is a stretched
 * link, and a tag that swallowed the click would make part of the photograph
 * unclickable.
 *
 * **Colours that do not flip with the theme.** These are fills on a
 * photograph, which is the same picture in both themes, so the pair has to
 * hold on its own. That rules out `accent` and `price-off`, which dark mode
 * *lightens* (#4cae81, #ff8a7a) because there they are text on a dark page —
 * as a fill under white text they would drop to about 2:1. Fixed steps are
 * used instead: the palette's own `brand-700` green, and two raw Tailwind
 * steps for the rest — `red-600`, the red the admin's danger buttons already
 * carry, and `orange-500`, because the palette's warm colour is `signal-500`
 * (#f0a500) and the client read that as yellow rather than orange
 * (2026-09-22). Near-black `graphite-950` sits on the orange at 6.5:1; white
 * on it would be 2.9:1 and fail.
 *
 * Out of stock comes first and alone: it is the one that changes what the
 * visitor can do, and stacking "Best seller" under "Out of stock" would be
 * selling something that cannot be bought.
 */
export function ProductTags({
  product,
  size = "default",
  inline = false,
  className = "",
}: {
  product: Pick<Product, "outOfStock" | "bestSeller" | "limitedDeal">;
  /** "compact" for the small thumbnail on a horizontal card — a ribbon there
   *  would be four unreadable letters, so it stays a flat chip. */
  size?: "default" | "compact";
  /** A plain row in the flow, for the product page and the quick view, where
   *  the tags belong beside the name rather than on a full-bleed photograph. */
  inline?: boolean;
  className?: string;
}) {
  const tags = visibleTags(product);
  if (tags.length === 0) return null;

  const pad = size === "compact" ? "px-1.5 py-0.5 text-[0.625rem]" : "px-2 py-1 text-[0.6875rem]";
  const chip = (tag: Tag) => (
    <span key={tag.label} className={`font-semibold uppercase tracking-wider ${pad} ${tag.tone}`}>
      {/* The thumbnail's chip is as narrow as the ribbon is, so it takes the
          same short wording (client, 2026-09-22: "here say limited deal for
          recent viewed as well"). The page's inline chips say it in full. */}
      {size === "compact" ? tag.short : tag.label}
    </span>
  );

  if (inline) {
    return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{tags.map(chip)}</div>;
  }

  const wash = product.outOfStock && (
    /* Out of stock also takes the colour out of the photograph, so a grid
       reads at a glance without anybody having to read the tag. A wash rather
       than `grayscale`, which Safari repaints on every hover of a card that
       also scales. */
    <span aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-surface/60" />
  );

  if (size === "compact") {
    /* **One tag only** on a thumbnail (client, 2026-09-22): the card is
       112px wide and two chips stacked on it cover the photograph. It is the
       first of the ranked list — out of stock, then the deal, then best
       seller — the same order the ribbon takes. The product page and the
       quick view, where there is room, still show both. */
    return (
      <>
        {wash}
        <div
          className={`pointer-events-none absolute left-0 top-0 z-20 flex flex-col items-start gap-1 p-2 ${className}`}
        >
          {chip(tags[0])}
        </div>
      </>
    );
  }

  /**
   * **The ribbon carries one tag** (client, 2026-09-22, with a picture of a
   * corner banner). Two of them across one corner is not a layout that
   * exists, so the tags are ranked and the first one wins: out of stock over
   * a deal over a best seller — what stops a sale, then what is about to end,
   * then what is merely true. A product with both marketing tags shows the
   * deal here and both on its own page, where they are a row of chips.
   *
   * The square clips the band; the band is `w-[150%]` so its ends are cut off
   * outside that square, which is what gives the folded look rather than a
   * rectangle with corners poking out.
   */
  const ribbon = tags[0];
  return (
    <>
      {wash}
      <div
        className={`pointer-events-none absolute right-0 top-0 z-20 h-[7.5rem] w-[7.5rem] overflow-hidden ${className}`}
      >
        <span
          className={`absolute right-[-2.5rem] top-[1.75rem] w-[10.625rem] rotate-45 py-1 text-center text-[0.625rem] font-bold uppercase leading-tight tracking-wider shadow-sm ${ribbon.tone}`}
        >
          {ribbon.short}
        </span>
      </div>
    </>
  );
}

type Tag = {
  label: string;
  /** What the ribbon and the thumbnail chip say. The band is a fixed
   *  diagonal and the thumbnail is 112px wide, so a long label is clipped or
   *  wrapped — "Limited time deal" becomes "Limited deal" in both, and stays
   *  in full on the product page's chips. */
  short: string;
  tone: string;
};

/**
 * The tags a product shows, most important first.
 *
 * Out of stock is shown **alone**: "Best seller" beside it would be promoting
 * something nobody can buy.
 */
function visibleTags(
  product: Pick<Product, "outOfStock" | "bestSeller" | "limitedDeal">,
): Tag[] {
  if (product.outOfStock) {
    return [{ label: "Out of stock", short: "Out of stock", tone: "bg-red-600 text-white" }];
  }
  return [
    ...(product.limitedDeal
      ? [
          {
            label: "Limited time deal",
            short: "Limited deal",
            tone: "bg-orange-500 text-graphite-950",
          },
        ]
      : []),
    ...(product.bestSeller
      ? [{ label: "Best seller", short: "Best seller", tone: "bg-brand-700 text-white" }]
      : []),
  ];
}

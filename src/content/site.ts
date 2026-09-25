/**
 * Single source of truth for company details.
 *
 * Consumed by the header, footer, mobile action bar, contact page, WhatsApp
 * link builder and the JSON-LD structured data. Change a number here and it
 * changes everywhere.
 *
 * TODO(vkon): every value marked TODO below is a placeholder. Replace before
 * the site goes live — the phone number in particular appears in structured
 * data that Google may surface directly in search results.
 */

export const site = {
  name: "Vkon",
  legalName: "Vkon Automation",
  domain: "vkon.in",
  logo: "https://vkon.in/brand/vkon-logo-round.jpeg",
  ogImage: "https://vkon.in/brand/vkon-og-banner.jpeg",
  /**
   * Public origin. Overridable so a staging deploy does not emit canonical
   * URLs and structured data pointing at production.
   */
  url: process.env.SITE_URL?.replace(/\/$/, "") || "https://vkon.in",
  tagline: "Motor protection that holds",
  description:
    "Advanced motor starters, industrial panels, and smart home automation with robust built-in protection and mobile control.",

  phone: {
    display: "+91 82170 86719",
    /** E.164, used for tel: links. */
    href: "+918217086719",
  },

  /** Digits only, country code first, no + or spaces. */
  whatsapp: "918217086719",

  /* The address customers write to, shown on /contact, the footer, /terms and
     /privacy, and where enquiry alerts are sent (new-order alerts go to
     `ordersEmail` since 2026-09-18). Changed from
     the Gmail address to the domain's own Microsoft 365 mailbox on 2026-09-17.
     Outgoing site mail still comes from no-reply@ (`MAIL_FROM`). */
  email: "support@vkon.in",

  /* The orders inbox (client, 2026-09-18): where new-order alerts go
     (`sendNewOrderAlert`). Nothing else is sent here, and it is never shown
     to customers — they write to `email` above. */
  ordersEmail: "orders@vkon.in",

  /* Quantity enquiries from a product page or the quick view (client,
     2026-09-25, changed from `email` the same day). Separate because the
     answer is a quotation rather than support: it is read by whoever prices
     a job, and it keeps trade enquiries out of the support queue. */
  b2bEmail: "b2b@vkon.in",

  /**
   * The business address (client, 2026-09-22 — it was the plus code
   * `VW8F+FVP, near Sahyadri College Mechanical and Civil Block` until then).
   *
   * **Razorpay's website verification compares what the site shows against
   * the KYC**, so this and the registered address have to be changed
   * together; the same is true of anything printed on an invoice.
   *
   * `geo` is unchanged: the park is on the same campus the plus code pointed
   * at, so the contact page's map is still within the grounds. It is the
   * centre of the `7J4PVW8F+FVP` square rather than the building's door.
   */
  address: {
    street: "3rd Floor, Sahyadri Entrepreneurship Park, Adyar",
    locality: "Mangaluru",
    region: "Karnataka",
    postalCode: "575007",
    country: "IN",
    countryName: "India",
    geo: { lat: 12.866212, lon: 74.924703 },
  },

  hours: "Monday – Saturday, 9:30 am – 6:30 pm IST",

  /** Founding year, used in the footer and the About page. */
  founded: 2010, // TODO(vkon): confirm

  /**
   * Social profiles, in the order they appear in the footer.
   *
   * An array rather than a keyed object so the order is the data rather than
   * whatever `Object.values` happens to produce, and so adding one is a single
   * entry. `key` selects the icon in `components/layout/Footer.tsx`; an unknown
   * key renders nothing rather than a blank circle. Remove an entry to drop it
   * from both the footer and the `sameAs` in the structured data.
   *
   * URLs are the canonical profile links with share tracking stripped —
   * `?igsh=`, `?utm_source=share_via`, `?s=11`, `?mibextid=` are all artefacts
   * of copying a link out of a phone app, and they should not be baked into
   * every page of a public site. Each was checked to still resolve.
   */
  socials: [
    {
      key: "facebook",
      label: "Facebook",
      /* TODO(vkon): this is a /share/ link, not a page vanity URL. It works,
         but a real page URL (facebook.com/vkonautomation) would be better in
         structured data and more obviously ours to anyone reading it. */
      href: "https://www.facebook.com/share/1H1XReqGpB/",
    },
    {
      key: "instagram",
      label: "Instagram",
      href: "https://www.instagram.com/vkonautomation",
    },
    { key: "x", label: "X", href: "https://x.com/vkonautomation" },
    {
      key: "youtube",
      label: "YouTube",
      href: "https://www.youtube.com/@Vkonautomation",
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      href: "https://www.linkedin.com/in/vkon-automation-b17087428",
    },
  ],

  /**
   * Free key from https://web3forms.com — it is a public, submit-only
   * identifier and is safe in client code. Set NEXT_PUBLIC_WEB3FORMS_KEY in
   * `.env.local` to enable the enquiry forms.
   */
  web3formsKey: process.env.NEXT_PUBLIC_WEB3FORMS_KEY ?? "",
} as const;

export const formattedAddress = [
  site.address.street,
  site.address.locality,
  `${site.address.region} ${site.address.postalCode}`,
  site.address.countryName,
].join(", ");

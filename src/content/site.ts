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
  /**
   * Public origin. Overridable so a staging deploy does not emit canonical
   * URLs and structured data pointing at production.
   */
  url: process.env.SITE_URL?.replace(/\/$/, "") || "https://vkon.in",
  tagline: "Motor protection that holds",
  description:
    "Vkon builds electronic motor starters and control panels for agricultural pumps — dry run, phase reversal, high and low voltage protection built in, with mobile control available across the range.",

  phone: {
    display: "+91 82170 86719",
    /** E.164, used for tel: links. */
    href: "+918217086719",
  },

  /** Digits only, country code first, no + or spaces. */
  whatsapp: "918217086719",

  email: "vkonautomation@gmail.com",

  address: {
    // TODO(vkon): replace with the real address.
    street: "Industrial Area",
    locality: "Kolar Gold Fields",
    region: "Karnataka",
    postalCode: "563122",
    country: "IN",
    countryName: "India",
  },

  hours: "Monday – Saturday, 9:30 am – 6:30 pm IST",

  /** Founding year, used in the footer and the About page. */
  founded: 2010, // TODO(vkon): confirm

  socials: {
    // Leave a value empty to hide that icon in the footer.
    facebook: "",
    instagram: "",
    youtube: "",
  },

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

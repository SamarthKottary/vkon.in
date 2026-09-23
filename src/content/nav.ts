export type NavLink = { href: string; label: string };

export const primaryNav: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact Us" },
];

/**
 * The signed-in account destinations.
 *
 * One list, used by the header's dropdown, the mobile drawer and the sidebar
 * on the account pages themselves — so a fourth destination is added once
 * rather than in three places that then drift. "Log out" is deliberately not
 * in it: it is a form submission, not a link, and every one of those three
 * renders it as a button of its own.
 */
export const accountNav: NavLink[] = [
  { href: "/account", label: "My account" },
  /* Addresses sits between the two (client, 2026-09-23): it is a list a
     customer maintains, like their orders, not a detail of their profile —
     it used to be a panel at the foot of My account. */
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/orders", label: "Order history" },
];

/**
 * Two link lists in the footer: the top-level categories, then the agriculture
 * range beneath it.
 *
 * Categories come first because they are the top of the taxonomy everywhere
 * else on the site. The categories listed under "Agriculture" are the only ones with
 * a shipping range, so listing every category across all three markets here
 * would pad the column with links to "Coming soon".
 */
export const footerNav: { heading: string; links: NavLink[] }[] = [
  {
    heading: "Categories",
    links: [
      { href: "/products?sector=agriculture", label: "Agriculture" },
      { href: "/products?sector=industrial", label: "Industrial" },
      { href: "/products?sector=commercial", label: "Commercial" },
    ],
  },
  {
    heading: "Agriculture",
    links: [
      { href: "/products?category=starter", label: "Motor Starters" },
      { href: "/products?category=solar", label: "Solar Systems" },
      { href: "/products?category=auto-start", label: "Auto Start Units" },
      { href: "/products?category=cable", label: "Cables" },
      { href: "/products?category=accessory", label: "Accessories" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About Vkon" },
      { href: "/contact", label: "Contact us" },
      { href: "/products", label: "Full catalogue" },
    ],
  },
];

export type NavLink = { href: string; label: string };

export const primaryNav: NavLink[] = [
  { href: "/products", label: "Products" },
  { href: "/about", label: "About" },
];

/**
 * Two link lists in the footer: the markets, then the agriculture range.
 *
 * Markets come first because they are the top of the taxonomy everywhere else
 * on the site. The categories listed under "Agriculture" are the only ones with
 * a shipping range, so listing every category across all three markets here
 * would pad the column with links to "Coming soon".
 */
export const footerNav: { heading: string; links: NavLink[] }[] = [
  {
    heading: "Markets",
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
      { href: "/products", label: "Full catalogue" },
    ],
  },
];

export type NavLink = { href: string; label: string };

export const primaryNav: NavLink[] = [
  { href: "/products", label: "Products" },
  { href: "/about", label: "About" },
];

export const footerNav: { heading: string; links: NavLink[] }[] = [
  {
    heading: "Products",
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

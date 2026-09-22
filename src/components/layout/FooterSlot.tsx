"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the footer on the two pages that are a task rather than a place
 * (client, 2026-09-22): the cart and checkout.
 *
 * Both are a single job — check what you are buying, pay for it — and the
 * footer under them is five blocks of addresses, categories and social links
 * inviting the customer back out of it. On every other page it is the way
 * around the site and stays.
 *
 * A client component so it can read the path; the footer itself is passed in
 * as `children` and stays a server component. It wraps the sticky curtain
 * wrapper too, so nothing is left holding space.
 */
const HIDDEN = ["/cart", "/checkout"];

export function FooterSlot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (HIDDEN.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;
  return <>{children}</>;
}

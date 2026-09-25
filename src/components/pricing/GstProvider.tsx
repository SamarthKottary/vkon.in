"use client";

import { createContext, useContext } from "react";
import { DEFAULT_GST, type GstRates } from "@/lib/pricing";

/**
 * The GST rates, from the database to every price on screen (client,
 * 2026-09-25: the rates became a super-user setting, and the prices shown on
 * products became tax-inclusive).
 *
 * **A context, because prices are drawn by client components.** `ProductCard`,
 * the cart and the checkout summary are all `"use client"` — none of them can
 * read `site_settings` — and threading a rate through every card, drawer and
 * modal would be a prop on a dozen components that exists only to carry two
 * numbers. The `(site)` layout is `force-dynamic` and already reads per
 * request, so it reads the rates once and puts them here, the same arrangement
 * the header's customer and `CartSync`'s id use.
 *
 * **The default is the answer outside the provider**, not an error: the admin
 * renders product cards too, and 9 + 9 is what this site has always charged.
 * A rate never makes it into what is *charged* this way — the server prices
 * every order itself with `getGstRates()`.
 */

const GstContext = createContext<GstRates>(DEFAULT_GST);

export function GstProvider({
  rates,
  children,
}: {
  rates: GstRates;
  children: React.ReactNode;
}) {
  return <GstContext.Provider value={rates}>{children}</GstContext.Provider>;
}

export function useGst(): GstRates {
  return useContext(GstContext);
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  /* Belt and braces with each page's own `noIndex`: a page added under here
     later inherits this even if whoever adds it forgets. Every one of these
     routes shows one person's own data — there is nothing here to rank, and
     indexing somebody's order history would be worse than useless. */
  robots: { index: false, follow: false },
};

/** A session is read on every one of these routes, so none of them can be
 *  cached. `force-dynamic` for the same reason `/admin` is. */
export const dynamic = "force-dynamic";

/**
 * Metadata and rendering mode only. **No chrome, and no guard.**
 *
 * Both omissions are deliberate, and the first was a bug before it was a
 * decision. This layout used to draw the signed-in sidebar whenever there was
 * a session — which is wrong for four of the routes beneath it.
 * `/account/login`, `/account/forgot`, `/account/reset` and `/account/verify`
 * are self-contained, centred pages with their own `<h1>`, and a signed-in
 * visitor reaching one of them got the sidebar wrapped around it and **two
 * `<h1>`s on the page** — which §9's heading-order rule exists to stop.
 *
 * So the shell moved to the pages that want it. Each already calls
 * `requireSignIn()` and therefore already holds the customer.
 *
 * There is no guard here either, and that is separate: a layout-level redirect
 * would make signing in impossible, since the sign-in form is itself under
 * `/account`. The real boundary is `requireCustomer()` inside each action —
 * a layout protects a render, never a POST. ARCHITECTURE.md §9.
 */
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

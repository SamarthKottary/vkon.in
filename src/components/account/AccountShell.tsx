import { LogoutIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { PageHero, SECTION_BACKGROUND } from "@/components/layout/PageHero";
import { accountNav } from "@/content/nav";
import { logoutAction } from "@/app/(site)/account/actions";
import type { Customer } from "@/lib/types";
import { AccountNavLink } from "./AccountNavLink";

/**
 * The signed-in account frame: a heading, a sidebar, and the page beside it.
 *
 * A server component — it takes the customer the layout already read and
 * renders it, and the only thing on this screen that needs the browser is
 * knowing which link is current, which is `AccountNavLink`'s whole job. Making
 * the whole shell a client component to get one `usePathname` would ship the
 * customer's name and address to the browser as serialised props for no reason.
 */
export function AccountShell({
  customer,
  children,
}: {
  customer: Customer;
  children: React.ReactNode;
}) {
  const first = customer.name.trim().split(/\s+/)[0];

  return (
    <>
      {/* One band for every page in this section — My account, Order history,
          Addresses and a single order all render through this shell, so they
          cannot end up with two different headings (client, 2026-09-16).

          The greeting stays the title rather than a generic "My account": it
          is what was here before, and it is the one line on these pages that
          is about the person rather than the paperwork. */}
      <PageHero
        compact
        background={SECTION_BACKGROUND}
        priority
        breadcrumb={[{ label: "Home", href: "/" }]}
        title={first ? `Hello, ${first}` : "My account"}
        description="Your orders, addresses and details."
      />

      {/* Pushes the header up once the band is past — see `Header`. */}
      <section data-curtain className="relative bg-surface py-10 sm:py-12 lg:py-16">
      <Container size="wide">
        <div className="grid gap-8 lg:grid-cols-[15rem_1fr] lg:gap-12">
          {/* **`min-w-0` is load-bearing.** A grid item defaults to
              `min-width: auto`, which means it refuses to shrink below its
              content's intrinsic width — so the scrolling chip row inside
              stretched the item instead of scrolling, and the whole document
              gained 13px of horizontal scroll at 390px. The overflow container
              only works once its parent is allowed to be narrower than it. */}
          <nav aria-label="Account" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            {/* Below `lg` this is a scrolling row of chips, so `-mx-*`/`px-*`
                lets the first and last sit flush with the page gutter while
                still scrolling past it — without them the row appears inset
                and the last chip looks clipped rather than scrollable. */}
            <ul className="hscroll -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0 lg:pb-0">
              {accountNav.map((link) => (
                <li key={link.href} className="shrink-0 lg:shrink lg:border-b lg:border-line">
                  <AccountNavLink href={link.href}>{link.label}</AccountNavLink>
                </li>
              ))}
              <li className="shrink-0 lg:shrink">
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="flex h-12 w-full items-center gap-2 whitespace-nowrap border border-line px-4 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-ink lg:h-auto lg:border-0 lg:px-0 lg:py-3.5"
                  >
                    <LogoutIcon className="h-4 w-4" />
                    Log out
                  </button>
                </form>
              </li>
            </ul>
          </nav>

          <div className="min-w-0">{children}</div>
        </div>
      </Container>
      </section>
    </>
  );
}

import Link from "next/link";
import { LogoutIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
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
    <section className="py-10 sm:py-12 lg:py-16">
      <Container size="wide">
        <nav aria-label="Breadcrumb">
          <ol className="label-tech flex flex-wrap items-center gap-2 text-muted">
            <li>
              <Link href="/" className="hover:text-ink">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page">My account</li>
          </ol>
        </nav>

        <h1 className="mt-8 text-[2rem] leading-tight sm:text-[2.5rem]">
          {first ? `Hello, ${first}` : "My account"}
        </h1>
        <p className="mt-3 text-body">{customer.email}</p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[15rem_1fr] lg:gap-12">
          <nav aria-label="Account" className="lg:sticky lg:top-24 lg:self-start">
            <ul className="hscroll flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
              {accountNav.map((link) => (
                <li key={link.href} className="shrink-0 lg:shrink lg:border-b lg:border-line">
                  <AccountNavLink href={link.href}>{link.label}</AccountNavLink>
                </li>
              ))}
              <li className="shrink-0 lg:shrink">
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="flex h-11 w-full items-center gap-2 whitespace-nowrap border border-line px-4 text-sm font-medium text-muted transition-colors hover:text-ink lg:h-auto lg:border-0 lg:px-0 lg:py-3.5"
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
  );
}

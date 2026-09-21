import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getSafeRedirectBase, issueSession } from "@/lib/account";
import { findCustomerById } from "@/lib/db/customers";

/**
 * Signs the operator into a customer's account, in a new tab (client,
 * 2026-09-21: "a login button on each user which lets us login to that users
 * account in a new tab … for super users and admin only").
 *
 * **POST, not a link**, and not a server action: the button opens a new tab
 * with `target="_blank"`, and this has to set a cookie on the response that
 * tab receives. A GET would also mean any page that embedded the URL — or a
 * prefetch — could start a session.
 *
 * **The role is checked here, not only on the page.** A route handler is an
 * addressable endpoint; the page's buttons are a convenience. Support and
 * viewer accounts get 403.
 *
 * What the session is: an ordinary customer session, identical to one the
 * customer would create by signing in, lasting as long as theirs would
 * (client's choice) — so the tab behaves exactly as the customer's browser
 * does, which is the point of it. Two things mark it anyway: the server log
 * line below, and the session row's `user_agent`, which records who opened
 * it. Neither is visible to the customer.
 *
 * **It replaces any customer session in this browser**, because it is the same
 * cookie. The operator's own /admin session is a different cookie and is
 * untouched, so /admin keeps working in the other tabs.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSession();
  if (!admin) return new NextResponse("Not signed in.", { status: 401 });
  if (admin.role !== "super" && admin.role !== "admin") {
    return new NextResponse("Only super users and admins can do this.", { status: 403 });
  }

  const { id } = await params;
  const customer = await findCustomerById(id);
  if (!customer) return new NextResponse("No such account.", { status: 404 });

  const h = await headers();
  const cookie = await issueSession(customer.id, undefined, `admin ${admin.email}`);

  /* The one durable trace outside the session row. Worth keeping: this is the
     one feature that lets one person act as another. */
  console.info(`[admin] ${admin.email} signed in as ${customer.email} (${customer.id})`);

  const response = NextResponse.redirect(
    new URL("/account", getSafeRedirectBase(h, request.url)),
    /* 303: the new tab posted this form, and what follows is a page to look
       at, not a resubmission of the post. */
    303,
  );
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

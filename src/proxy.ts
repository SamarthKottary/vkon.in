import { NextResponse, type NextRequest } from "next/server";

/**
 * **Where the admin was trying to go** (client, 2026-09-25: signing out and
 * then opening a bookmarked admin page "shows reload page. Instead it should
 * show the admin login page and then redirect to the page i was trying to
 * open").
 *
 * `proxy.ts`, not `middleware.ts`: Next 16 deprecated that file convention and
 * renamed it — same request object, same `config.matcher`, the exported
 * function is now `proxy`, and it runs on the Node.js runtime by default
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 *
 * Two jobs, both about routing and neither about security:
 *
 *  - **It puts the requested URL on the request** as `x-admin-url`, path and
 *    query together. A server component cannot otherwise read the URL it is
 *    rendering for — `searchParams` is only half of it — and that URL is what
 *    `requireAdminPage()` needs to send somebody back to after signing in.
 *  - **With no admin cookie at all, it redirects to the sign-in page** with
 *    that URL as `?next=`, instead of letting the page render and throw.
 *
 * **The cookie is not verified here, deliberately.** A proxy is a network
 * boundary in front of the app — Next's own guidance is that it may run
 * outside the app's runtime, and not to rely on shared modules from it — so
 * verifying the session would mean either importing the admin auth module and
 * its database pool into that boundary, or writing the signature check a
 * second time. Two implementations of one signature scheme is how a session
 * check quietly stops checking.
 *
 * The pages and every server action still call
 * `getAdminSession()`/`requireAdmin()`, which verify properly; a forged or
 * expired cookie gets past this file and is stopped there, landing on the
 * same sign-in page through `requireAdminPage()`. This is the difference
 * between "route them somewhere sensible" and "let them in", and only the
 * first is done here.
 */

const COOKIE = "vkon_admin";

/** The admin pages that exist precisely for somebody who is not signed in. */
const PUBLIC = ["/admin", "/admin/forgot", "/admin/reset"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const url = `${pathname}${search}`;

  if (!PUBLIC.includes(pathname) && !request.cookies.has(COOKIE)) {
    const login = new URL("/admin", request.url);
    login.searchParams.set("next", url);
    return NextResponse.redirect(login);
  }

  const headers = new Headers(request.headers);
  headers.set("x-admin-url", url);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/admin/:path*",
};

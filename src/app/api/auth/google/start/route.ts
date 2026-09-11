import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, OAUTH_TTL_MS, beginGoogleSignIn, isGoogleConfigured } from "@/lib/google";
import { getSafeRedirectBase, isRequestHttps } from "@/lib/account";

/**
 * Step one of "Continue with Google": send the browser to Google.
 *
 * A route handler rather than a server action because this has to be a plain
 * GET the browser navigates to. A server action is a POST whose response is a
 * React payload, not a redirect the browser will follow off-site to
 * accounts.google.com.
 *
 * Nothing here is a mutation, so there is no guard beyond the configuration
 * check — the only thing this endpoint can do is hand out a URL and a nonce.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/account/login?error=google", getSafeRedirectBase(request.headers, request.nextUrl)));
  }

  const next = request.nextUrl.searchParams.get("next") ?? "/account";
  const { url, cookieValue } = beginGoogleSignIn(next);

  const response = NextResponse.redirect(url);

  /* `sameSite: lax` and not `strict`. The callback arrives as a top-level
     navigation from accounts.google.com, which is cross-site: a `strict`
     cookie is not sent on it, the state check finds nothing to compare
     against, and every single sign-in fails with "expired". `lax` is sent on
     exactly this kind of navigation and on no other cross-site request. */
  const isHttps = isRequestHttps(request.headers, request.nextUrl);

  response.cookies.set(OAUTH_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: OAUTH_TTL_MS / 1000,
  });

  return response;
}

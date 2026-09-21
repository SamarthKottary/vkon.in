import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirectBase, issueSession, isRequestHttps, type SessionCookie } from "@/lib/account";
import {
  createCustomer,
  createSignInCode,
  findCustomerByEmail,
  findCustomerByGoogleSub,
  linkGoogleAccount,
} from "@/lib/db/customers";
import { refreshGoogleAvatar } from "@/lib/avatars";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isMailConfigured, sendSignInCodeMail, sendWelcomeMail } from "@/lib/mail";
import {
  OAUTH_COOKIE,
  completeGoogleSignIn,
  isGoogleConfigured,
  parseOauthCookie,
  safeNext,
} from "@/lib/google";
import {
  CHALLENGE_TTL_MS,
  DEVICE_COOKIE,
  buildChallengeCookie,
  buildTrustCookie,
  isTrustedDevice,
} from "@/lib/signin-challenge";

/**
 * Step two of "Continue with Google": Google sends the browser back here.
 *
 * Every failure below ends at `/account/login` with a short reason in the
 * query string, never a stack trace and never a 500 — somebody who has just
 * been bounced between two sites needs a way back to the form, not an error
 * page. The specifics go to the server log.
 */
export const dynamic = "force-dynamic";

/** One place to build the failure redirect, so every path clears the
 *  handshake cookie. A stale one left behind makes the *next* attempt fail
 *  too, which is how a one-off failure turns into a stuck sign-in. */
function fail(request: NextRequest, reason: string) {
  const response = NextResponse.redirect(
    new URL(`/account/login?error=${reason}`, getSafeRedirectBase(request.headers, request.nextUrl)),
  );
  response.cookies.delete(OAUTH_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  if (!isGoogleConfigured() || !isDatabaseConfigured()) {
    return fail(request, "google");
  }

  const params = request.nextUrl.searchParams;

  /* The customer pressed "Cancel" on Google's account chooser. Not an error
     worth a message — put them back on the form quietly. */
  if (params.get("error")) {
    const response = NextResponse.redirect(
      new URL("/account/login", getSafeRedirectBase(request.headers, request.nextUrl)),
    );
    response.cookies.delete(OAUTH_COOKIE);
    return response;
  }

  const code = params.get("code");
  const state = params.get("state");
  const handshake = parseOauthCookie(request.cookies.get(OAUTH_COOKIE)?.value);

  if (!code || !state || !handshake) return fail(request, "expired");

  /* The CSRF check. A callback whose state does not match the cookie this
     browser was given is somebody else's authorization code being delivered
     here — which, unchecked, signs this visitor into the attacker's account
     and quietly records everything they then do in it. */
  if (state !== handshake.state) return fail(request, "state");

  const profile = await completeGoogleSignIn(code, handshake.verifier);
  if (!profile) return fail(request, "google");

  /* Google will not normally return an unverified address for a
     `google.com`-hosted account, but a federated Workspace domain can. The
     address is about to be treated as proof of who this is and used to adopt
     an existing account below, so an unverified one is refused rather than
     trusted. */
  if (!profile.emailVerified) return fail(request, "unverified");

  const isHttps = isRequestHttps(request.headers, request.nextUrl);
  const destination = safeNext(handshake.next);

  // -------------------------------------------------------------------------
  // Admin Login Flow
  // -------------------------------------------------------------------------
  if (destination.startsWith("/admin")) {
    try {
      const { findAdminByEmail } = await import("@/lib/db/adminUsers");
      const admin = await findAdminByEmail(profile.email);
      if (!admin) {
        console.warn(`[google] Admin sign in attempted by non-admin: ${profile.email}`);
        return fail(request, "unauthorized");
      }

      const { issueAdminSession } = await import("@/lib/auth");
      const session = await issueAdminSession(admin.id);
      if (!session) {
        return fail(request, "not-configured");
      }

      const response = NextResponse.redirect(new URL(destination, getSafeRedirectBase(request.headers, request.nextUrl)));
      response.cookies.set(session.name, session.value, session.options);
      response.cookies.delete(OAUTH_COOKIE);
      return response;
    } catch (error) {
      console.error("[google] Admin account lookup failed:", error);
      return fail(request, "google");
    }
  }

  // -------------------------------------------------------------------------
  // Customer Login Flow
  // -------------------------------------------------------------------------
  let customerId: string;
  let isNew = false;

  try {
    /* Look up by `sub` first, not by email. The sub is Google's permanent id
       for the account; the address on it can change, and matching on the
       address alone would hand the account to whoever holds that address
       today. */
    let customer = await findCustomerByGoogleSub(profile.sub);

    if (!customer) {
      const existing = await findCustomerByEmail(profile.email);

      if (existing) {
        /* Registered with a password first, now signing in with Google at the
           same address. Linking is what makes those one account instead of a
           unique-index error the customer cannot do anything about. Google
           has verified the address, and this row was created by somebody who
           could receive mail at it, so they are the same person.

           `linkGoogleAccount` only writes where `google_sub IS NULL`, so a
           second Google account cannot take over one already linked. */
        await linkGoogleAccount(existing.id, profile.sub);
        customer = existing;
      } else {
        customer = await createCustomer({
          email: profile.email,
          name: profile.name,
          /* No password. `password_hash` stays NULL and `verifyPassword`
             returns false for it, so this account simply cannot be signed
             into with a password until one is set from /account. */
          passwordHash: null,
          googleSub: profile.sub,
          emailVerified: true,
        });

        /* Lost the race with a simultaneous registration on the same address.
           Re-reading is the recovery: the row now exists, and it is theirs. */
        if (!customer) customer = await findCustomerByEmail(profile.email);
        if (!customer) return fail(request, "google");

        isNew = true;
      }
    }

    customerId = customer.id;

    /* Their Google photo as the profile picture, unless they chose their own
       or removed it (2026-09-19). Fetched only when Google's has changed;
       never throws, never waits more than a few seconds. */
    await refreshGoogleAvatar(customer, profile.picture);
  } catch (error) {
    console.error("[google] account lookup failed:", error);
    return fail(request, "google");
  }

  const deviceCookie = request.cookies.get(DEVICE_COOKIE)?.value;

  /**
   * Google has proved who this is; the code proves it is happening on a
   * browser the account has used before.
   *
   * Skipped for an account being created right now — there is nothing behind
   * it yet, and the person has just proved control of the address Google
   * gave us — and skipped when no mail provider is configured, for the reason
   * `skipTheCode` records in `account/actions.ts`.
   */
  try {
    const needsCode =
      !isNew && isMailConfigured() && !(await isTrustedDevice(customerId, deviceCookie));

    if (needsCode) {
      const code = await createSignInCode({ customerId, ttlMs: CHALLENGE_TTL_MS });
      const sent = await sendSignInCodeMail({
        to: profile.email,
        name: profile.name,
        code,
        minutes: Math.round(CHALLENGE_TTL_MS / 60000),
      });
      if (!sent.ok) console.error("[google] sign-in code email failed:", sent.error);

      const pending = buildChallengeCookie(customerId, destination, isHttps);
      const response = NextResponse.redirect(
        new URL("/account/verify-code", getSafeRedirectBase(request.headers, request.nextUrl)),
      );
      response.cookies.set(pending.name, pending.value, pending.options);
      response.cookies.delete(OAUTH_COOKIE);
      return response;
    }
  } catch (error) {
    console.error("[google] sign-in challenge failed:", error);
    return fail(request, "google");
  }

  let session: SessionCookie;
  try {
    /* The cookie is set on the response below rather than through
       `cookies()`. See the note on `issueSession`: a cookie written the other
       way may or may not survive onto a redirect this handler constructed,
       and when it does not, the failure is a silent bounce back to the
       sign-in form. */
    session = await issueSession(customerId, isHttps);
  } catch (error) {
    console.error("[google] session failed:", error);
    return fail(request, "google");
  }

  if (isNew) {
    /* No confirmation link: Google has already proved the address, so asking
       them to prove it again would be a step with nothing behind it. */
    try {
      await sendWelcomeMail({
        to: profile.email,
        name: profile.name,
        verifyUrl: null,
      });
    } catch (err) {
      console.error("[google] welcome email failed:", err);
    }
  }

  const response = NextResponse.redirect(new URL(destination, getSafeRedirectBase(request.headers, request.nextUrl)));
  response.cookies.set(session.name, session.value, session.options);
  response.cookies.delete(OAUTH_COOKIE);

  /* Remember this browser, so the next Google sign-in on it is not challenged
     — and so the trust is refreshed rather than expiring under somebody who
     uses the site regularly. A failure here is not worth losing the session
     over: the cost is one extra code next time. */
  try {
    const trust = await buildTrustCookie(
      customerId,
      isHttps,
      deviceCookie,
      request.headers.get("user-agent") ?? "",
    );
    response.cookies.set(trust.name, trust.value, trust.options);
  } catch (error) {
    console.error("[google] could not record the trusted device:", error);
  }

  return response;
}

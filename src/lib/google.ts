import { createHash, randomBytes } from "node:crypto";
import { site } from "@/content/site";

/**
 * "Continue with Google", written out rather than imported.
 *
 * An auth library would be the ordinary answer; the dependency policy in
 * ARCHITECTURE.md §2 is why this is 150 lines of standard OAuth 2.0 instead.
 * There is nothing bespoke in it — authorization code flow with PKCE, exactly
 * as in RFC 6749 and RFC 7636 — and every non-obvious decision is recorded
 * below.
 *
 * Missing configuration is a supported state: with no `GOOGLE_CLIENT_ID` the
 * button simply does not render and the password form is the whole page. That
 * keeps local development and a fresh deploy working before anybody has been
 * to the Google Cloud console.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** The name of the short-lived cookie holding the PKCE verifier and the state
 *  nonce between the redirect out and the redirect back. */
export const OAUTH_COOKIE = "vkon_oauth";

/** Ten minutes is longer than anyone takes to pick a Google account and short
 *  enough that an abandoned attempt does not leave a usable cookie around. */
export const OAUTH_TTL_MS = 10 * 60 * 1000;

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * The redirect URI, which must match one registered in the Google console
 * character for character — including the scheme and any port.
 *
 * Derived from `site.url` (i.e. `SITE_URL`) rather than from the incoming
 * request's Host header, deliberately: Host is attacker-controlled, and
 * building an OAuth redirect from it is how open-redirect and token-leak bugs
 * happen. `GOOGLE_REDIRECT_URI` overrides it outright, which is what local
 * development uses — `http://localhost:3000/...` while `SITE_URL` still points
 * at production.
 */
export function redirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `${site.url.replace(/\/$/, "")}/api/auth/google/callback`
  );
}

export type OauthHandshake = {
  /** Where to send the browser. */
  url: string;
  /** Goes in the cookie, not the URL. */
  cookieValue: string;
};

/**
 * Builds the authorization URL and the value to remember alongside it.
 *
 * Two separate secrets travel here and they do different jobs:
 *
 *  - **`state`** is echoed back by Google in the query string and compared
 *    against the cookie. It is what makes a forged callback — somebody else's
 *    authorization code delivered to your browser — fail. Without it, an
 *    attacker can log you into *their* account and watch what you do in it.
 *  - **`verifier`** (PKCE) never leaves this server until the token exchange.
 *    It is what makes an intercepted authorization code useless on its own.
 *    Google does not require PKCE for a confidential web client, which has a
 *    secret; it costs four lines and removes a whole class of failure, so it
 *    is here anyway.
 *
 * `next` is the path to return to after signing in. It is stored in the
 * cookie rather than the URL so it cannot be rewritten mid-flight, and the
 * callback re-checks that it is a local path before redirecting to it.
 */
export function beginGoogleSignIn(next: string): OauthHandshake {
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    /* `openid email profile`, and nothing more. The id_token that comes back
       carries the sub, the address and the display name, which is the whole
       of what an account here needs; asking for a Drive or Contacts scope
       would put this app in front of Google's verification review for data it
       has no use for. */
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    /* `select_account` so a shared family phone with two Google accounts on it
       gets the chooser instead of silently reusing whichever was last used.
       That is the common case for this audience, not an edge case. */
    prompt: "select_account",
  });

  return {
    url: `${AUTH_ENDPOINT}?${params.toString()}`,
    cookieValue: JSON.stringify({ state, verifier, next: safeNext(next) }),
  };
}

export type OauthCookie = { state: string; verifier: string; next: string };

export function parseOauthCookie(raw: string | undefined): OauthCookie | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { state, verifier, next } = parsed as Record<string, unknown>;
    if (typeof state !== "string" || typeof verifier !== "string") return null;
    return {
      state,
      verifier,
      next: safeNext(typeof next === "string" ? next : "/account"),
    };
  } catch {
    return null;
  }
}

/**
 * Local paths only.
 *
 * `//evil.example` is a protocol-relative URL that browsers follow off-site,
 * so "starts with a slash" is not enough on its own — this is the check that
 * keeps the sign-in flow from being turned into an open redirect that lends
 * vkon.in's name to somebody else's page.
 */
export function safeNext(next: string): string {
  if (!next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}

export type GoogleProfile = {
  /** Google's stable account id. This, never the email, is what identifies an
   *  account: a Google user can change their address, and reusing an address
   *  that Google later hands to somebody else would hand over the account. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

/**
 * Exchanges the authorization code for the profile.
 *
 * **The id_token's signature is deliberately not verified**, and that is
 * Google's own documented position for this shape of flow: the token arrives
 * as the body of a direct, server-to-server HTTPS response from
 * `oauth2.googleapis.com`, authenticated with the client secret. There is no
 * third party in that exchange to forge it. Verifying would mean fetching and
 * caching Google's JWKS and implementing RS256 — real code, and real code that
 * can be wrong — to re-prove something TLS already proved. The claims below
 * are still checked, because a mismatched `aud` would mean a token minted for
 * a different client, which is worth catching however it got here.
 */
export async function completeGoogleSignIn(
  code: string,
  verifier: string,
): Promise<GoogleProfile | null> {
  if (!isGoogleConfigured()) return null;

  let payload: Record<string, unknown>;

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[google] token exchange ${response.status}: ${detail}`);
      return null;
    }

    const body = (await response.json()) as { id_token?: string };
    if (!body.id_token) {
      console.error("[google] token response carried no id_token");
      return null;
    }

    const claims = decodeJwtPayload(body.id_token);
    if (!claims) return null;
    payload = claims;
  } catch (error) {
    console.error("[google] token exchange failed:", error);
    return null;
  }

  const iss = String(payload.iss ?? "");
  const aud = String(payload.aud ?? "");
  const sub = String(payload.sub ?? "");
  const email = String(payload.email ?? "").trim().toLowerCase();
  const exp = Number(payload.exp ?? 0);

  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") {
    console.error(`[google] unexpected issuer: ${iss}`);
    return null;
  }
  if (aud !== process.env.GOOGLE_CLIENT_ID) {
    console.error("[google] id_token audience does not match this client");
    return null;
  }
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    console.error("[google] id_token is expired");
    return null;
  }
  if (!sub || !email) {
    console.error("[google] id_token carried no sub or email");
    return null;
  }

  return {
    sub,
    email,
    /* Google sends this as a real boolean in the id_token, but has historically
       sent the string "true" through other endpoints. Accept both rather than
       silently treating a verified address as unverified. */
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: String(payload.name ?? "").trim().slice(0, 120),
  };
}

/** Base64url payload of a JWT, with no signature check. See the note above on
 *  why that is the right call here and would not be if this token arrived from
 *  anywhere but a direct call to Google. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

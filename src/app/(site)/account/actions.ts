"use server";

import { isSigninCodeOn } from "@/lib/db/settings";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { endAllSessions, endSession, startSession } from "@/lib/account";
import {
  consumeSignInCode,
  consumeToken,
  createCustomer,
  createSignInCode,
  createToken,
  findCustomerByEmail,
  findCustomerById,
  getPasswordHash,
  invalidateTokens,
  markEmailVerified,
  setCustomerPassword,
  untrustAllDevices,
} from "@/lib/db/customers";
import { isDatabaseConfigured } from "@/lib/db/client";
import { normaliseEmail } from "@/lib/db/subscribers";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { confirmationProblem } from "@/lib/password-policy";
import {
  isMailConfigured,
  sendPasswordResetMail,
  sendSignInCodeMail,
  sendWelcomeMail,
} from "@/lib/mail";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/google";
import {
  CHALLENGE_TTL_MS,
  clearChallenge,
  isTrustedDevice,
  readChallenge,
  startChallenge,
  trustThisDevice,
} from "@/lib/signin-challenge";
import { site } from "@/content/site";
import { emailLink } from "@/lib/links";

/**
 * Public account actions — register, sign in, sign out, forgotten password.
 *
 * **This is the second unauthenticated write path on the site**, after
 * `app/(site)/actions.ts`. ARCHITECTURE.md §9 states the rule for that file
 * and it applies here unchanged: anything in here is reachable by anyone on
 * the internet as a bare POST, so every action carries the same three guards.
 *
 *  1. **A honeypot** on the two actions a bot would spray — register and
 *     forgotten-password. Filled means a bot, and it gets the ordinary success
 *     message, so it learns nothing. Sign-in has none: a bot filling it in
 *     still has to know a real password, and a silent success there would be
 *     indistinguishable from a real sign-in to a confused human.
 *  2. **A rate limit**, keyed on the client address, tightest on sign-in.
 *     This also closes half of the gap §11 records as "no login rate
 *     limiting" — the admin's sign-in is still unlimited; this one is not.
 *  3. **Bounded, validated values only**, reaching Postgres through
 *     parameterised queries.
 *
 * Anything here that needs a signed-in customer belongs in
 * `private-actions.ts` instead, whose every export begins with
 * `requireCustomer()`.
 *
 * ## The rule this file keeps coming back to
 *
 * **Nothing here may reveal whether an address has an account.** A form that
 * answers that question is an account-enumeration oracle: it hands anybody a
 * list of this business's customers, and hands a phisher a list of addresses
 * worth targeting with a fake vkon.in mail. So a failed sign-in says the same
 * thing whether the address is unknown or the password is wrong; "forgot
 * password" says the same thing whether or not it sent anything; and
 * registering with an address that already exists sends *that address* a
 * "somebody tried to register" note and tells the browser the same thing it
 * tells a successful registration. The subscribe action in
 * `app/(site)/actions.ts` already works this way for the same reason.
 */

export type AuthState = {
  status: "idle" | "ok" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Which form the message belongs to, so one page can host both and show
   *  the error under the form that produced it. */
  form?: "login" | "register" | "forgot" | "reset" | "code";
  /**
   * What was typed, echoed back so the form can restore it.
   *
   * **React 19 resets an uncontrolled form once its action resolves.** Without
   * this, a mistyped password wipes the email address as well, and somebody on
   * a phone retypes the whole thing to correct one field — found by a flow
   * test where the second sign-in attempt silently never submitted, because
   * `required` on an emptied field blocked it in the browser and nothing ever
   * reached the server.
   *
   * The fields listed here are the ones restored. **A password is never among
   * them**: echoing one back would put it in the HTML of the response and in
   * the browser's back-forward cache, to save one field of retyping.
   */
  values?: { email?: string; name?: string; phone?: string };
};

/* Sign-in is the tightest: it is the one action where a script gets something
   out of guessing. Ten attempts per ten minutes is generous for somebody who
   has genuinely forgotten which password they used and useless as an attack.
   Registration is limited more loosely because a shared rural connection can
   legitimately put several people behind one address. */
const LOGIN_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };
const REGISTER_LIMIT = { limit: 5, windowMs: 30 * 60 * 1000 };
const FORGOT_LIMIT = { limit: 4, windowMs: 30 * 60 * 1000 };
const RESET_LIMIT = { limit: 10, windowMs: 30 * 60 * 1000 };
/* Six digits is a million possibilities; ten tries per ten minutes makes
   guessing hopeless while leaving room for somebody mistyping a code off a
   phone screen. Asking for a fresh code is limited harder, because each one
   sends an email and that is the part an abuser would aim at. */
const CODE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };
const RESEND_CODE_LIMIT = { limit: 4, windowMs: 15 * 60 * 1000 };

const MAX = { name: 120, phone: 40, email: 254 };

const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

/** The generic failure. One string, used everywhere, so no code path can
 *  accidentally be more specific than another. */
const SIGN_IN_FAILED = "That email address and password do not match.";
const DONE = "If that email address is registered, we've sent instructions to reset your password.";

function unavailable(form: AuthState["form"]): AuthState {
  return {
    status: "error",
    form,
    message: `Accounts are unavailable right now. Please call us on ${site.phone.display}.`,
  };
}

async function limited(
  bucket: string,
  limit: { limit: number; windowMs: number },
): Promise<boolean> {
  const requestHeaders = await headers();
  return !rateLimit(`${bucket}:${clientKey(requestHeaders)}`, limit).ok;
}

/** Absolute URL for a link in an email. Built from `SITE_URL`, never from the
 *  request's Host header — see the same reasoning in `lib/google.ts`. */
/** See `lib/links.ts`: the live site's address, or this one in development. */
const absoluteUrl = emailLink;

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  // Honeypot. See SubscribePanel for how the field is hidden from humans.
  if (String(formData.get("company") ?? "").trim()) {
    return { status: "ok", form: "register", message: "Check your email to continue." };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, MAX.name);
  const email = normaliseEmail(String(formData.get("email") ?? "").slice(0, MAX.email));
  const phone = String(formData.get("phone") ?? "").trim().slice(0, MAX.phone);
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/account"));

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Please tell us your name.";
  if (!email) fieldErrors.email = "That does not look like an email address.";
  const passwordIssue = passwordProblem(password);
  if (passwordIssue) fieldErrors.password = passwordIssue;

  /* Checked here and not only in the browser: the second box is an ordinary
     form field, and a request that simply omits it would otherwise set a
     password nobody has confirmed. */
  const confirmIssue = confirmationProblem(password, String(formData.get("confirmPassword") ?? ""));
  if (!passwordIssue && confirmIssue) fieldErrors.confirmPassword = confirmIssue;

  /* Echoed back on every error return below. See the note on `AuthState`. */
  const typed = { name, phone, email: email ?? String(formData.get("email") ?? "").trim() };

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      form: "register",
      message: "Please check the highlighted fields.",
      fieldErrors,
      values: typed,
    };
  }

  if (!isDatabaseConfigured()) return { ...unavailable("register"), values: typed };
  if (await limited("register", REGISTER_LIMIT)) {
    return {
      status: "error",
      form: "register",
      message: "Too many attempts. Please try again in a little while.",
      values: typed,
    };
  }

  let customerId: string;

  try {
    const hash = await hashPassword(password);
    const created = await createCustomer({
      email: email as string,
      name,
      phone,
      passwordHash: hash,
    });

    if (!created) {
      /* The address is taken. Telling the browser so would answer "does this
         person have an account here?" for any address a stranger types, so
         instead the *owner of the address* is told — they are the one person
         entitled to know, and if it was them who just forgot, the mail is
         exactly the help they needed. The browser gets the message a
         successful registration gets. */
      const existing = await findCustomerByEmail(email as string);
      if (existing) {
        await invalidateTokens(existing.id, "reset");
        const token = await createToken({
          customerId: existing.id,
          kind: "reset",
          ttlMs: RESET_TTL_MS,
        });
        /* Awaited, for two reasons. A dangling promise across a `return`
           may never run; and this branch must take about as long as a
           successful registration, which also sends a mail — a reply that
           comes back noticeably faster for a taken address is the timing
           version of the same oracle. */
        await sendPasswordResetMail({
          to: existing.email,
          name: existing.name,
          resetUrl: await absoluteUrl(`/account/reset?token=${token}`),
        });
      }
      return {
        status: "ok",
        form: "register",
        message:
          "Check your email — we have sent you a link to finish setting up your account.",
      };
    }

    customerId = created.id;

    const token = await createToken({
      customerId,
      kind: "verify",
      ttlMs: VERIFY_TTL_MS,
    });

    /* Awaited, not fired and forgotten: this route is about to redirect, and
       a promise left dangling across a redirect in a serverless-shaped runtime
       is a promise that may never run. `sendMail` never throws, so a provider
       outage costs a few seconds and a console line, not the account. */
    await sendWelcomeMail({
      to: email as string,
      name,
      verifyUrl: await absoluteUrl(`/account/verify?token=${token}`),
    });

    await startSession(customerId);

    /* The browser that created the account is trusted from the start. There
       is nothing for a code to prove here — this person chose the password a
       second ago — and challenging them would put an inbox round trip between
       registering and the checkout they were heading for. */
    await trustThisDevice(customerId);
  } catch (error) {
    console.error("[account] registration failed:", error);
    return { ...unavailable("register"), values: typed };
  }

  /* Registering signs you straight in. Making somebody who has just typed
     their details type them again is the kind of step that loses a sale on a
     phone with a flaky connection, and the email link is a confirmation, not
     a gate — nothing on the site is withheld until it is clicked. */
  revalidatePath("/", "layout");
  redirect(next);
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

/* Not exported: every export of a `"use server"` module must be an async
   function, and a stray string constant makes Next drop the whole module —
   which shows up as "registerAction was not found", nowhere near the cause. */
const CODE_PAGE = "/account/verify-code";

/**
 * Whether this browser may skip the emailed code.
 *
 * **Also true when there is no mail provider**, and that is a deliberate
 * operational choice rather than an oversight: with `RESEND_API_KEY` unset
 * there is no way to deliver a code, so challenging would lock every customer
 * out of a shop that otherwise works. Every other integration here degrades
 * the same way — no keys, no feature. The cost is that the second factor is
 * only as present as the mail setup is, which is why the setup guide treats
 * Resend as the one integration to do first.
 *
 * **Also true while the operator has the code switched off** — one switch at
 * the top of `/admin/users` (client, 2026-09-21), in place of the per-account
 * exemption that came before it (2026-09-17, for Razorpay's website
 * verification: their reviewers sign in from a browser this site has never
 * seen, with no way to read the code). It is off for everybody or on for
 * everybody, `isSigninCodeOn` fails safe towards on, and it is meant to be
 * switched back the moment a review is finished.
 */
async function skipTheCode(customerId: string): Promise<boolean> {
  if (!isMailConfigured()) return true;
  if (!(await isSigninCodeOn())) return true;
  return isTrustedDevice(customerId);
}

/**
 * Issues a code, emails it, and marks this browser as waiting for it.
 *
 * No session is started here — that is the whole point. The pending cookie
 * names the account and nothing else; only the code, which exists solely in
 * the customer's inbox, turns it into a session.
 */
async function beginSignInChallenge(
  customer: { id: string; email: string; name: string },
  next: string,
): Promise<void> {
  const code = await createSignInCode({
    customerId: customer.id,
    ttlMs: CHALLENGE_TTL_MS,
  });

  await startChallenge(customer.id, next);

  /* `sendMail` never throws and reports its result instead. A failure is
     logged and the customer still lands on the code page, where "Send a new
     code" is the way out — better than a dead end on the sign-in form with a
     session we have already decided not to grant. */
  const sent = await sendSignInCodeMail({
    to: customer.email,
    name: customer.name,
    code,
    minutes: Math.round(CHALLENGE_TTL_MS / 60000),
  });
  if (!sent.ok) console.error("[account] sign-in code email failed:", sent.error);
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normaliseEmail(String(formData.get("email") ?? "").slice(0, MAX.email));
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/account"));

  /* The address is echoed back on every failure; the password never is. */
  const typed = { email: email ?? String(formData.get("email") ?? "").trim().slice(0, MAX.email) };

  if (!email || !password) {
    return { status: "error", form: "login", message: SIGN_IN_FAILED, values: typed };
  }

  if (!isDatabaseConfigured()) return { ...unavailable("login"), values: typed };
  if (await limited("login", LOGIN_LIMIT)) {
    return {
      status: "error",
      form: "login",
      message: "Too many sign-in attempts. Please wait a few minutes and try again.",
      values: typed,
    };
  }

  let customerId: string;
  let needsCode = false;

  try {
    const customer = await findCustomerByEmail(email);
    const hash = customer ? await getPasswordHash(customer.id) : null;

    /* `verifyPassword` is called even when there is no account, against a
       null hash it returns false for. Skipping it would make "no such
       address" measurably faster than "wrong password" — scrypt is ~100 ms
       and the difference is trivially observable — which is the timing
       version of the enumeration oracle this file exists to avoid. */
    const ok = await verifyPassword(password, hash);

    if (!customer || !ok) {
      /* A Google-only account has no password at all, and lands here. The
         sign-in page names that possibility in general terms next to the
         Google button rather than in this response, which would again be
         saying something about a specific address. */
      return { status: "error", form: "login", message: SIGN_IN_FAILED, values: typed };
    }

    customerId = customer.id;

    /* The password was right. Whether that is enough depends on the browser:
       one this account has already answered a code on goes straight through,
       anything else is challenged. See `lib/signin-challenge.ts`. */
    if (await skipTheCode(customerId)) {
      await startSession(customerId);
    } else {
      await beginSignInChallenge(
        { id: customerId, email: customer.email, name: customer.name },
        next,
      );
      needsCode = true;
    }
  } catch (error) {
    console.error("[account] sign-in failed:", error);
    return { ...unavailable("login"), values: typed };
  }

  revalidatePath("/", "layout");
  redirect(needsCode ? CODE_PAGE : next);
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

/**
 * Unguarded on purpose, exactly as the admin's `logoutAction` is: ending your
 * own session is not a privileged operation, and requiring a valid session to
 * clear a session is a way to get stuck with a broken one.
 */
// ---------------------------------------------------------------------------
// The sign-in code
// ---------------------------------------------------------------------------

const CODE_WRONG = "That code is not right, or it has expired. Check the email, or send a new code.";

/**
 * Turns a pending challenge into a session.
 *
 * Reads *who* from the signed pending cookie and *whether* from the code, so
 * neither alone is enough: a stolen cookie has no code in it, and a code is
 * hashed against the account it was issued for and works for no other.
 *
 * On success the browser is recorded as trusted, which is what stops this
 * becoming a code on every visit.
 */
export async function verifySignInCodeAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  /* Digits only, and bounded before anything else touches it. */
  const code = String(formData.get("code") ?? "").replace(/\D/g, "").slice(0, 6);

  const challenge = await readChallenge();
  if (!challenge) {
    return {
      status: "error",
      form: "code",
      message: "That sign-in timed out. Please enter your email and password again.",
    };
  }

  if (code.length !== 6) {
    return { status: "error", form: "code", message: CODE_WRONG };
  }

  if (!isDatabaseConfigured()) return unavailable("code");
  if (await limited("code", CODE_LIMIT)) {
    return {
      status: "error",
      form: "code",
      message: "Too many attempts. Please wait a few minutes and try again.",
    };
  }

  try {
    const ok = await consumeSignInCode(challenge.customerId, code);
    if (!ok) return { status: "error", form: "code", message: CODE_WRONG };

    await startSession(challenge.customerId);
    await trustThisDevice(challenge.customerId);
    await clearChallenge();
  } catch (error) {
    console.error("[account] code verification failed:", error);
    return unavailable("code");
  }

  revalidatePath("/", "layout");
  redirect(safeNext(challenge.next));
}

/** Issues a fresh code for the pending challenge, retiring the previous one.
 *  The old code stops working the moment this succeeds — `createSignInCode`
 *  invalidates it — so a forwarded email cannot be used after asking again. */
/* No parameters: `useActionState` passes the previous state and the form data,
   and this needs neither — the account comes from the pending cookie. A
   function that declares fewer arguments is still assignable to the hook. */
export async function resendSignInCodeAction(): Promise<AuthState> {
  const challenge = await readChallenge();
  if (!challenge) {
    return {
      status: "error",
      form: "code",
      message: "That sign-in timed out. Please enter your email and password again.",
    };
  }

  if (!isDatabaseConfigured()) return unavailable("code");
  if (await limited("code-resend", RESEND_CODE_LIMIT)) {
    return {
      status: "error",
      form: "code",
      message: "That is a lot of codes. Please wait a few minutes before asking for another.",
    };
  }

  try {
    const customer = await findCustomerById(challenge.customerId);
    if (!customer) {
      return {
        status: "error",
        form: "code",
        message: "That sign-in timed out. Please enter your email and password again.",
      };
    }

    await beginSignInChallenge(
      { id: customer.id, email: customer.email, name: customer.name },
      challenge.next,
    );
  } catch (error) {
    console.error("[account] resending the sign-in code failed:", error);
    return unavailable("code");
  }

  return { status: "ok", form: "code", message: "A new code is on its way." };
}

/** Abandons a pending sign-in — the "use a different account" way out of the
 *  code page. Clears only the pending cookie; no session ever existed. */
export async function cancelSignInAction(): Promise<void> {
  await clearChallenge();
  redirect("/account/login");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  revalidatePath("/", "layout");
  redirect("/");
}

// ---------------------------------------------------------------------------
// Forgotten password
// ---------------------------------------------------------------------------

export async function forgotPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (String(formData.get("company") ?? "").trim()) {
    return { status: "ok", form: "forgot", message: DONE };
  }

  const email = normaliseEmail(String(formData.get("email") ?? "").slice(0, MAX.email));

  const typed = { email: String(formData.get("email") ?? "").trim().slice(0, MAX.email) };

  if (!email) {
    return {
      status: "error",
      form: "forgot",
      message: "That does not look like an email address.",
      values: typed,
    };
  }

  if (await limited("forgot", FORGOT_LIMIT)) {
    return {
      status: "error",
      form: "forgot",
      message: "Too many reset attempts. Please wait a few minutes and try again.",
      values: typed,
    };
  }

  try {
    const customer = await findCustomerByEmail(email);
    if (customer && customer.emailVerified) {
      const rawToken = await createToken({
        customerId: customer.id,
        kind: "reset",

        ttlMs: RESET_TTL_MS,
      });
      await sendPasswordResetMail({
        to: customer.email,
        name: customer.name,
        resetUrl: await absoluteUrl(`/account/reset?token=${rawToken}`),
      });
    }
  } catch (error) {
    console.error("[account] forgot-password failed:", error);
  }


  return { status: "ok", form: "forgot", message: DONE };
}
// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

export async function resetPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const token = String(formData.get("token") ?? "").trim().slice(0, 200);
  const password = String(formData.get("password") ?? "");

  if (!token) {
    return {
      status: "error",
      form: "reset",
      message: "That reset link is not valid. Please request a new one.",
    };
  }

  const issue = passwordProblem(password);
  if (issue) {
    return {
      status: "error",
      form: "reset",
      message: issue,
      fieldErrors: { password: issue },
    };
  }

  const mismatch = confirmationProblem(password, String(formData.get("confirmPassword") ?? ""));
  if (mismatch) {
    return {
      status: "error",
      form: "reset",
      message: mismatch,
      fieldErrors: { confirmPassword: mismatch },
    };
  }

  if (!isDatabaseConfigured()) return unavailable("reset");
  if (await limited("reset", RESET_LIMIT)) {
    return {
      status: "error",
      form: "reset",
      message: "Too many attempts. Please wait a few minutes and try again.",
    };
  }

  let customerId: string;

  try {
    const result = await consumeToken(token, "reset");

    if (!result.ok) {
      return {
        status: "error",
        form: "reset",
        message:
          result.reason === "used"
            ? "That link has already been used. Please request a new one."
            : result.reason === "expired"
              ? "That link has expired. Please request a new one."
              : "That reset link is not valid. Please request a new one.",
      };
    }

    customerId = result.customerId;
    await setCustomerPassword(customerId, await hashPassword(password));

    /* Every existing session ends, including this browser's. Somebody
       resetting a password is often doing it *because* they think another
       person has access; leaving that person's session alive would defeat the
       whole exercise. */
    await endAllSessions(customerId);

    /* And every trusted browser, for the same reason: a device an intruder
       had already answered a code on would otherwise sail past the new
       password's protection on their next visit. */
    await untrustAllDevices(customerId);
    await markEmailVerified(customerId);
  } catch (error) {
    console.error("[account] password reset failed:", error);
    return unavailable("reset");
  }

  /* No "password changed" email after a reset (client, 2026-09-19). The
     reset link itself went only to the inbox. EMAILS.md C. */

  /* **No session is issued here** (client, 2026-09-16: choosing a new
     password should not sign you in). Whoever opened the link proved they can
     read the inbox, which is not the same as proving they know the password
     that was just set — and the person who actually owns the account is the
     one who should type it. It also means the reset link cannot be used as a
     way in: following it now costs an intruder the account's sessions and
     gains them nothing. */
  revalidatePath("/", "layout");
  redirect("/account/login?reset=1");
}

// ---------------------------------------------------------------------------
// Email confirmation
// ---------------------------------------------------------------------------

export type VerifyOutcome = "ok" | "used" | "expired" | "invalid" | "unavailable";

/**
 * Called from the `/account/verify` page rather than a form.
 *
 * It is a GET, which is normally the wrong verb for something that writes —
 * but the write is idempotent (a verified account verified again is verified),
 * the token is single-use, and a link in an email cannot be a POST. This is
 * the shape every email-confirmation link has.
 */
export async function confirmEmail(token: string): Promise<VerifyOutcome> {
  if (!token || !isDatabaseConfigured()) return "unavailable";

  try {
    const result = await consumeToken(token, "verify");
    if (!result.ok) return result.reason;
    await markEmailVerified(result.customerId);
    return "ok";
  } catch (error) {
    console.error("[account] email confirmation failed:", error);
    return "unavailable";
  }
}

"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, GoogleIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { Field, Honeypot, fieldInput } from "@/components/ui/Field";
import { PasswordField } from "@/components/ui/PasswordField";
import { loginAction, registerAction, type AuthState } from "@/app/(site)/account/actions";

/**
 * Sign in and register, on one page behind two tabs.
 *
 * The client asked for both on the same screen ("During login we should option
 * to register for new users and login for existing users"), which is also the
 * right shape for this audience: somebody arriving from a cart does not yet
 * know which of the two they are, and a page that makes them find out by
 * failing at one of them is a page they leave.
 *
 * **Two `useActionState` hooks, not one.** They hold separate error state, so
 * a failed sign-in does not leave its message hanging over the register form
 * when the tab is switched — and both forms stay mounted, so a half-typed
 * registration survives a look at the other tab.
 *
 * Nothing here is a security control. Every guard — honeypot, rate limit,
 * validation, the constant-time password comparison — is in the action, which
 * is a POST endpoint anybody can reach without loading this page at all.
 */

const initial: AuthState = { status: "idle" };

export function AuthPanel({
  next,
  googleEnabled,
  initialTab = "login",
  notice,
}: {
  next: string;
  googleEnabled: boolean;
  initialTab?: "login" | "register";
  /** A message from the redirect that sent us here, e.g. a failed Google
   *  round trip or "sign in to check out". */
  notice?: string;
}) {
  const uid = useId();
  const [tab, setTab] = useState<"login" | "register">(initialTab);

  return (
    <div className="mx-auto w-full max-w-md">
      {notice && (
        <p
          role="status"
          className="mb-6 flex items-start gap-2 border-l-2 border-accent bg-accent-soft px-4 py-3 text-sm text-ink"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          {notice}
        </p>
      )}

      <div className="border border-line bg-surface-raised shadow-card">
        {/* Two buttons, not links: switching tab must not be a navigation that
            throws away whatever is already typed into the other form.
            `aria-selected` is only meaningful on a real `tab`, so the roles
            are here rather than the attribute on a bare button. */}
        <div role="tablist" aria-label="Sign in or register" className="grid grid-cols-2">
          {(["login", "register"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${uid}-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`${uid}-panel-${key}`}
              onClick={() => setTab(key)}
              className={`border-b-2 py-4 text-sm font-semibold uppercase tracking-wider transition-colors ${
                tab === key
                  ? "border-accent bg-surface-raised text-ink"
                  : "border-line bg-surface-subtle text-muted hover:text-ink"
              }`}
            >
              {key === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <div className="p-6 sm:p-8">
          {/* Both stay mounted; only one is shown. `hidden` rather than
              unmounting keeps each form's typed values and its own action
              state alive across a tab switch — and `hidden` rather than a
              `display:none` class, because the attribute also takes the
              inactive form out of the tab order and out of the accessibility
              tree, which a class does not. */}
          <div
            role="tabpanel"
            id={`${uid}-panel-login`}
            aria-labelledby={`${uid}-tab-login`}
            hidden={tab !== "login"}
          >
            <SignInForm next={next} />
          </div>
          <div
            role="tabpanel"
            id={`${uid}-panel-register`}
            aria-labelledby={`${uid}-tab-register`}
            hidden={tab !== "register"}
          >
            <RegisterForm next={next} />
          </div>

          {/* **The Google button renders only when Google is configured**, and
              its absence is the designed behaviour rather than a fault: a
              button that leads to a 500 because `GOOGLE_CLIENT_ID` is unset is
              worse than no button, and a fresh clone has to work before
              anybody has been to the Google Cloud console.

              That is easy to mistake for the feature being missing, so in
              development the reason is printed instead. `NODE_ENV` is inlined
              at build time, so this block is eliminated entirely from a
              production bundle — it cannot leak to a visitor. */}
          {!googleEnabled && process.env.NODE_ENV === "development" && (
            <p className="mt-7 border-l-2 border-signal-500 bg-surface-subtle px-4 py-3 text-xs leading-relaxed text-body">
              <span className="font-semibold text-ink">
                Development note — &ldquo;Continue with Google&rdquo; is hidden.
              </span>{" "}
              It appears as soon as <code className="font-mono">GOOGLE_CLIENT_ID</code>{" "}
              and <code className="font-mono">GOOGLE_CLIENT_SECRET</code> are set in{" "}
              <code className="font-mono">.env.local</code>. Step-by-step setup is in{" "}
              <code className="font-mono">docs/SETUP-GUIDE.md</code>. This note is
              never shown in production.
            </p>
          )}

          {googleEnabled && (
            <>
              <div className="my-7 flex items-center gap-4">
                <span className="h-px flex-1 bg-line" />
                <span className="label-tech text-muted">or</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              {/* A plain anchor, not `next/link` and not a form. This has to
                  leave the app entirely — the route handler behind it responds
                  with a redirect to accounts.google.com, and a client-side
                  navigation cannot follow one off-site. */}
              <a
                href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}
                className="flex h-12 w-full items-center justify-center gap-3 border border-line-strong bg-surface text-[0.9375rem] font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
              >
                <GoogleIcon className="h-5 w-5" />
                Continue with Google
              </a>

              <p className="mt-4 text-center text-xs leading-relaxed text-muted">
                Signing in with Google works whether or not you have registered
                here before — if the email matches an account you already have,
                the two become one.
              </p>
            </>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/account/forgot" className="text-accent hover:underline">
          Forgotten your password?
        </Link>
      </p>
    </div>
  );
}

function SignInForm({ next }: { next: string }) {
  const uid = useId();
  const [state, formAction] = useActionState<AuthState, FormData>(loginAction, initial);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      <Message state={state} />

      <Field id={`${uid}-email`} label="Email" required>
        <input
          id={`${uid}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          /* React 19 resets an uncontrolled form once its action resolves, so
             without this a mistyped password also wipes the address. The
             action echoes it back for exactly this. The password field below
             deliberately has no equivalent. */
          defaultValue={state.values?.email ?? ""}
          className={fieldInput()}
        />
      </Field>

      <SignInPasswordField />

      <Submit idle="Sign in" busy="Signing in…" />
    </form>
  );
}

function RegisterForm({ next }: { next: string }) {
  const uid = useId();
  const [state, formAction] = useActionState<AuthState, FormData>(registerAction, initial);

  /* The success branch only renders when registration did *not* redirect —
     which is the "this address already has an account" case, where the action
     deliberately reports the same thing a real registration reports and mails
     the address a way back in. A successful new registration signs in and
     leaves this page, so it never gets here. */
  if (state.status === "ok") {
    return (
      <div
        role="status"
        className="flex items-start gap-4 border border-accent bg-accent-soft px-5 py-5"
      >
        <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <p className="font-medium text-ink">{state.message}</p>
          <p className="mt-2 text-sm leading-relaxed text-body">
            It can take a minute to arrive. Check your spam folder if it does
            not.
          </p>
        </div>
      </div>
    );
  }

  const error = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      <Message state={state} />

      <Field id={`${uid}-name`} label="Your name" error={error("name")} required>
        <input
          id={`${uid}-name`}
          name="name"
          autoComplete="name"
          required
          maxLength={120}
          defaultValue={state.values?.name ?? ""}
          className={fieldInput(error("name"))}
        />
      </Field>

      <Field id={`${uid}-email`} label="Email" error={error("email")} required>
        <input
          id={`${uid}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={state.values?.email ?? ""}
          className={fieldInput(error("email"))}
        />
      </Field>

      <Field id={`${uid}-phone`} label="Phone" optional error={error("phone")}>
        <input
          id={`${uid}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={40}
          defaultValue={state.values?.phone ?? ""}
          className={fieldInput(error("phone"))}
        />
      </Field>

      {/* The requirements tick as they are typed rather than being reported
          after a failed submit — see the note on `PasswordField`. It reads the
          rules from `lib/password.ts`, which is what the action validates
          with, so the two cannot disagree. */}
      <PasswordField error={error("password")} />

      <Honeypot />

      <Submit idle="Create my account" busy="Creating…" />

      <p className="text-sm leading-relaxed text-muted">
        We use your details to process orders and reach you about them, and for
        nothing else.
      </p>
    </form>
  );
}

/**
 * The sign-in password field: a plain input with the same "Show"/"Hide"
 * reveal `PasswordField` gives the register form, and nothing else — no
 * strength meter or rule checklist, because those describe a password being
 * *chosen*, not one already set. Kept here rather than in `ui/PasswordField`
 * so that component can stay "the composition-rules field" without a mode
 * flag threading through it for a screen that does not use most of what it
 * shows.
 */
function SignInPasswordField() {
  const uid = useId();
  const [revealed, setRevealed] = useState(false);

  return (
    <Field id={`${uid}-password`} label="Password" required>
      <div className="relative">
        <input
          id={`${uid}-password`}
          name="password"
          type={revealed ? "text" : "password"}
          autoComplete="current-password"
          required
          maxLength={200}
          className={`${fieldInput()} pr-16`}
        />
        {/* Visible text, not an icon with an aria-label — same reasoning as
            the equivalent button in `ui/PasswordField`: an accessible name
            that leads with what is on screen, so voice control can say what
            it sees. */}
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="absolute inset-y-0 right-0 px-3 text-xs font-semibold uppercase tracking-wider text-muted transition-colors hover:text-ink"
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </div>
    </Field>
  );
}

function Message({ state }: { state: AuthState }) {
  if (state.status !== "error" || !state.message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 border-l-2 border-red-600 bg-surface-subtle px-4 py-3 text-sm text-red-700"
    >
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      {state.message}
    </p>
  );
}

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="lg" className="w-full">
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? busy : idle}
    </Button>

  );
}

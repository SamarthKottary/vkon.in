"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, InfoIcon, SpinnerIcon } from "@/components/icons/ui";
import { storeSendLinkAction, storeSignInAction, type StoreFormState } from "./actions";

/**
 * One store's sign-in (client, 2026-09-26).
 *
 * **The email is the pickup in-charge's**, as Shiprocket holds it — so there is
 * no account to create here and nothing for the office to hand out. The first
 * sign-in has no password at all: pressing **Set or reset password** mails the
 * link, and the page says so before anybody has to guess.
 */
export function StoreSignIn({
  slug,
  name,
  blocked,
}: {
  slug: string;
  name: string;
  blocked?: boolean;
}) {
  const [state, signIn] = useActionState<StoreFormState, FormData>(storeSignInAction, {});
  const [link, sendLink] = useActionState<StoreFormState, FormData>(storeSendLinkAction, {});

  if (blocked) {
    return (
      <div className="mx-auto max-w-sm border border-signal-500 bg-surface p-6 text-center">
        <h1 className="text-xl">{name}</h1>
        <p className="mt-3 text-sm leading-relaxed text-body">
          This store is blocked. Ask the office to unblock it before signing in.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl">{name}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Sign in with the email address on this store&rsquo;s pickup address at
        Shiprocket.
      </p>

      {state.error ? (
        <p role="alert" className="mt-6 flex items-start gap-3 border border-signal-500 bg-surface px-4 py-3 text-sm text-ink">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-signal-500" />
          {state.error}
        </p>
      ) : null}

      {(state.hint || link.hint) && (
        <p role="status" className="mt-6 flex items-start gap-3 border border-accent bg-accent-soft px-4 py-3 text-sm text-ink">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          {link.hint || state.hint}
        </p>
      )}

      <form action={signIn} className="mt-6 space-y-4 border border-line bg-surface-raised p-6">
        <input type="hidden" name="slug" value={slug} />
        <div>
          <label htmlFor="store-email" className="label-tech block text-muted">
            Email address
          </label>
          <input
            id="store-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            defaultValue={state.email}
            className="mt-2 w-full border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </div>
        <div>
          <label htmlFor="store-password" className="label-tech block text-muted">
            Password
          </label>
          <input
            id="store-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-2 w-full border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </div>
        <SubmitButton label="Sign in" />
      </form>

      <form action={sendLink} className="mt-4 text-center">
        <input type="hidden" name="slug" value={slug} />
        <SubmitLink />
      </form>
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 border border-accent bg-accent text-sm font-semibold text-surface transition-colors hover:bg-accent-strong disabled:opacity-60"
    >
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Signing in…" : label}
    </button>
  );
}

function SubmitLink() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm text-accent transition-colors hover:underline disabled:opacity-60"
    >
      {pending ? "Sending…" : "Set or reset password"}
    </button>
  );
}

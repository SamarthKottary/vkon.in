"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, SpinnerIcon } from "@/components/icons/ui";
import { loginAction, type ActionState } from "./actions";

export function LoginForm({
  googleEnabled,
  next = "",
}: {
  googleEnabled?: boolean;
  /** The admin page to open once signed in — already checked by `adminNext`
   *  on the page, and checked again in the action. */
  next?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="email" className="label-tech block text-muted">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          defaultValue={state.values?.email}
          aria-invalid={Boolean(state.error)}
          className="mt-2 w-full border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="label-tech block text-muted">
            Password
          </label>
          <a
            href="/admin/forgot"
            className="text-xs text-accent hover:underline"
            tabIndex={-1}
          >
            Forgotten password?
          </a>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.error)}
          className="mt-2 w-full border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        />
      </div>

      {state.error && (
        <p role="alert" className="flex gap-2 text-sm text-red-700">
          <AlertIcon className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      <SubmitButton />

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

          <a
            href={`/api/auth/google/start?next=${encodeURIComponent(next || "/admin")}`}
            className="flex h-10 w-full items-center justify-center gap-3 border border-line-strong bg-surface text-[0.9375rem] font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </a>
        </>
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm bg-action px-4 text-sm font-medium text-action-ink transition-colors hover:bg-action-hover disabled:opacity-50"
    >
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

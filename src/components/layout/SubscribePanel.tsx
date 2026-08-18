"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { subscribeAction, type SubscribeState } from "@/app/(site)/actions";

/**
 * Mailing list sign-up, between the contact block and the footer.
 *
 * It reads as its own object rather than as the top of the footer: a bordered
 * card on `surface-raised`, on a `surface` band, above the green footer. That
 * is three distinct tones in a row at the end of the page.
 *
 * It was on the dark band until 2026-08-18, sharing `bg-band` with the footer
 * and divided from it by one hairline — which made the end of the page a single
 * green slab with a form embedded in it. Being light also puts it on ordinary
 * `surface`/`ink` tokens, so it follows the theme like the rest of the page
 * instead of staying dark in both.
 *
 * Notes:
 *  - **The honeypot is hidden four ways** (off-screen, zero size, no pointer
 *    events, `tabIndex={-1}`) and carries `autoComplete="off"` so a browser's
 *    autofill does not helpfully fill it in and lock a real visitor out of the
 *    form. `aria-hidden` keeps it out of the accessibility tree, so a screen
 *    reader never meets it either.
 *  - **The form is replaced by its confirmation on success**, rather than
 *    keeping a filled field beside a message. `useActionState` does not reset
 *    the form, so leaving it would show "You're on the list" above an address
 *    still sitting in the box, which reads like it has not been sent.
 *  - **The status message is a live region**, so the outcome is announced
 *    rather than only being visible.
 */
export function SubscribePanel() {
  const [state, formAction] = useActionState<SubscribeState, FormData>(
    subscribeAction,
    { status: "idle" },
  );

  return (
    <section
      aria-labelledby="subscribe-heading"
      className="border-t border-line bg-surface py-14 sm:py-16"
    >
      <Container size="wide">
        <div className="border border-line bg-surface-raised p-7 shadow-card sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-center lg:gap-16">
            <div>
              <h2
                id="subscribe-heading"
                className="text-[1.5rem] leading-tight sm:text-[1.75rem]"
              >
                New panels, and what changed
              </h2>
              <p className="mt-3 leading-relaxed text-body">
                An occasional note when we add a product, change a rating or
                publish something worth reading. No more than that.
              </p>
            </div>

            {state.status === "ok" ? (
              <p
                role="status"
                className="flex items-start gap-3 border border-accent bg-accent-soft px-5 py-4 text-ink"
              >
                <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <span>
                  {state.message}
                  <span className="mt-1 block text-sm text-muted">
                    We will only use it for the note described here.
                  </span>
                </span>
              </p>
            ) : (
              <form action={formAction} className="max-w-xl">
                <label
                  htmlFor="subscribe-email"
                  className="label-tech block text-muted"
                >
                  Email address
                </label>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="subscribe-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    aria-invalid={state.status === "error"}
                    aria-describedby="subscribe-note"
                    className="min-w-0 flex-1 border border-line-strong bg-surface px-4 py-3 text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                  />
                  <SubmitButton />
                </div>

                {/* Hidden from people, and from assistive technology, but
                    present in the DOM for anything filling every field it
                    finds. */}
                <input
                  type="text"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
                />

                {state.status === "error" && (
                  <p
                    role="alert"
                    className="mt-3 flex items-center gap-2 text-sm text-red-700"
                  >
                    <AlertIcon className="h-4 w-4 shrink-0" />
                    {state.message}
                  </p>
                )}

                <p id="subscribe-note" className="mt-3 text-sm text-muted">
                  Your address, and nothing else. We do not pass it on, and you
                  can ask us to remove it at any time.
                </p>
              </form>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  /* `text-action-ink`, never `text-white`: the action colour inverts between
     themes, so a hard-coded white disappears on the light-on-dark button the
     dark theme uses. ARCHITECTURE §9. */
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex shrink-0 items-center justify-center gap-2 bg-action px-6 py-3 text-sm font-medium text-action-ink transition-colors hover:bg-action-hover disabled:opacity-60"
    >
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Signing up…" : "Subscribe"}
    </button>
  );
}

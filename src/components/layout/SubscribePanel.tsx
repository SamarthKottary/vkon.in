"use client";

import Image from "next/image";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, ArrowRightIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Container } from "@/components/ui/Container";
import { subscribeAction, type SubscribeState } from "@/app/(site)/actions";

/**
 * Mailing list sign-up.
 *
 * Placed by the pages that want it — home, about and contact — rather than by
 * a shared block. It rendered from inside `ContactStrip` until 2026-08-19,
 * which put it on every page that closes with contact details, including the
 * catalogue and each product page.
 *
 * One panel with the photograph behind all of it, rather than a coloured block
 * beside a picture. The content sits in the left half; the right half is left
 * to the photograph.
 *
 * **The scrim here is heavier than the hero's, and that is the artwork, not a
 * preference.** This frame is a high-key paddy field under a pale sky — mean
 * luminance 0.43, where the hero frames sit between 0.05 and 0.15. White text
 * over it needs roughly twice the covering the hero needs. Every figure below
 * was measured against the rendered pixels, not estimated; if the picture is
 * ever swapped, re-measure rather than assuming these numbers carry over.
 *
 * `next/image` rather than a CSS background, unlike the version this replaced:
 * the picture is now always displayed, so the element has layout, `sizes`
 * resolves, and a phone is served a phone-sized variant instead of the largest
 * one. The reasoning is in ARCHITECTURE §9.
 */
export function SubscribePanel() {
  const [state, formAction] = useActionState<SubscribeState, FormData>(
    subscribeAction,
    { status: "idle" },
  );

  return (
    <section
      aria-labelledby="subscribe-heading"
      /* `isolate` so the -z-10 blurred bleed stays inside this section rather
         than sliding behind neighbouring sections. `overflow-hidden` clips
         the `scale-110` on the bleed image — that trick hides the transparent
         edge halo that heavy blur otherwise paints around the frame. */
      className="relative isolate overflow-hidden border-t border-line bg-surface py-14 sm:py-16 lg:py-20"
    >
      {/* Bleed background (client request, 2026-08-19). Same photograph as
          the sharp panel below, extended past the container to the viewport
          edges and into the section's vertical padding. `blur-lg` (16px) —
          dialled down from the initial `blur-3xl` at the client's second
          pass — leaves the field and sky recognisable rather than smearing
          them into a colour wash. `scale-105` overshoots the frame just
          enough that the blur's soft edges are clipped rather than showing
          as a transparent halo. */}
      <Image
        src="/subscribe-background.jpg"
        alt=""
        aria-hidden
        fill
        sizes="100vw"
        className="-z-10 scale-105 object-cover object-[50%_78%] blur-lg"
      />
      {/* Light scrim over the bleed, so it does not overpower the neighbouring
          sections. The sharp panel below carries its own three-layer scrim. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-surface/40" />

      <Container size="wide">
        <div className="relative overflow-hidden border border-line shadow-card">
          <Image
            src="/subscribe-background.jpg"
            alt=""
            fill
            sizes="(min-width: 1280px) 76rem, 100vw"
            /* Weighted low, not centred. `object-cover` on a wide frame in a
               short band crops top and bottom evenly by default, and the
               interesting half of this photograph is the lower one. */
            className="object-cover object-[50%_78%]"
          />

          {/* Shaped like the hero's: heavy left, falling to transparent at the
              right edge so the photograph is seen rather than filmed over.

              The flat floor is mobile-only and heavier here than anywhere else
              — 58. Two reasons compound: this frame is a high-key paddy field
              (mean luminance 0.43, against 0.05–0.15 for the hero frames), and
              at 390px the copy spans the panel's full width, so neither the
              left-weighted pass nor the top-left diagonal covers its right
              half. It measured 4.09:1 at 44 before this was raised. */}
          <div aria-hidden className="absolute inset-0 bg-scrim/58 lg:bg-transparent" />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-scrim/88 via-scrim/70 to-transparent"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-scrim/40 via-transparent to-transparent"
          />

          <div className="relative px-7 py-12 sm:px-12 sm:py-16 lg:py-20">
            <div className="max-w-xl">
              <h2
                id="subscribe-heading"
                className="text-[1.75rem] leading-tight text-band-ink sm:text-[2rem]"
              >
                New panels, and what changed
              </h2>
              <p className="mt-4 max-w-md leading-relaxed text-band-body">
                An occasional note when we add a product, change a rating or
                publish something worth reading. No more than that.
              </p>

              {state.status === "ok" ? (
                <p
                  role="status"
                  className="mt-8 flex max-w-md items-start gap-3 rounded-2xl border border-band-accent bg-scrim/80 px-5 py-4 text-band-ink"
                >
                  <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-band-accent" />
                  <span>
                    {state.message}
                    <span className="mt-1 block text-sm text-band-body">
                      We will only use it for the note described here.
                    </span>
                  </span>
                </p>
              ) : (
                <form action={formAction} className="mt-8 max-w-md">
                  <label
                    htmlFor="subscribe-email"
                    className="label-tech block text-band-muted"
                  >
                    Email address
                  </label>

                  {/* The pill is opaque, not translucent. Over a photograph a
                      see-through field puts leaves behind the text a visitor is
                      typing, and the placeholder contrast then depends on which
                      part of the picture it lands on.

                      `dark:bg-white` (client, 2026-08-27: "make the button and
                      input box white in dark mode and black in light mode")
                      — deliberately breaks from `band-*`'s usual theme
                      invariance (documented beside the tokens themselves:
                      calibrated for the photograph, not the page toggle).
                      Light mode keeps the existing `bg-band` unchanged — it
                      was already near-black, which is what "black in light
                      mode" asks for. `dark:text-band` and a hard-coded
                      `dark:placeholder:text-[#5a636c]` follow the background
                      swap for legibility: `text-band-ink` (white) would be
                      invisible on the new white surface, and there is no
                      existing "muted-on-a-light-surface, regardless of page
                      theme" token to reach for, since every semantic token
                      here auto-inverts with the page — so this reuses
                      `--color-muted`'s own light-theme value verbatim rather
                      than inventing an unrelated grey. */}
                  <div className="mt-3 flex items-center gap-2 rounded-full border border-band-line bg-band p-1.5 pl-5 transition-colors focus-within:border-band-accent dark:bg-white">
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
                      className="min-w-0 flex-1 bg-transparent py-2 text-band-ink placeholder:text-band-muted focus:outline-none dark:text-band dark:placeholder:text-[#5a636c]"
                    />
                    <SubmitButton />
                  </div>

                  {/* Hidden from people and from assistive technology, but
                      present in the DOM for anything filling every field. */}
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
                      className="mt-3 flex items-center gap-2 text-sm text-band-ink"
                    >
                      <AlertIcon className="h-4 w-4 shrink-0 text-signal-500" />
                      {state.message}
                    </p>
                  )}

                  <p id="subscribe-note" className="mt-4 text-sm text-band-body">
                    Your address, and nothing else. We do not pass it on, and
                    you can ask us to remove it at any time.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  /* Resting colour (client, 2026-08-27: "make the button and input box white
     in dark mode and black in light mode... the subscribe button glows from
     white to green or black to green") — `bg-band`/`text-band-ink` (black,
     white text) in light mode, `dark:bg-white`/`dark:text-band` (white,
     black text) in dark mode. `band-accent`, the resting green this replaced,
     is gone from this button entirely now; the ordinary `accent` token
     — already theme-aware by design, unlike the `band-*` family — is used
     for the sweep fill only, chosen over `band-accent` for the sweep
     specifically because of the light-mode pairing with white text: `accent`
     is `#23703d` in light mode against `band-accent`'s `#4cae81`, and by the
     WCAG relative-luminance formula white on the darker `#23703d` is 6.1:1
     where white on `#4cae81` is only 2.7:1 — `accent` was the choice that
     needed no compromise anywhere. All four resting/hover × light/dark
     combinations clear 4.5:1: ~17:1 for both resting pairs (near-black on
     white or the reverse), 6.1:1 for light mode's hover (white text on
     `#23703d`), 6.2:1 for dark mode's (`dark:text-band` on `accent`'s dark
     value, `#4cae81` — which happens to equal `band-accent` exactly).

     Sweep mechanics (client, 2026-08-27, earlier the same day: "add the
     loading animation to the subscribe button") — the same `::before`
     left-to-right fill as `ui/Button`'s `sweep` prop, reproduced locally
     rather than switched to that shared component: `ui/Button` is hard-set
     to `rounded-sm` ("No pills, no shadows" is stated as a rule there) and
     its colour variants don't include the `band-*` tokens this button still
     needs for the border and the input pill beside it. Replaces
     `hover:opacity-90` — with the sweep as the hover signal, a second
     competing one (dimming the button, including the sweep layer itself)
     would only muddy it. `isolate` scopes the `-z-10` pseudo-element's
     stacking to this button, matching `ui/Button`'s own reasoning;
     `overflow-hidden` clips the fill to the pill's `rounded-full`, not a
     square corner poking out of a round one.

     `border-2 border-accent` (client, 2026-08-27: "Lets have green outline
     on the subscribe button") — same theme-aware `accent` token as the
     sweep fill, so the outline is the exact colour the button flоods to on
     hover rather than a second green needing its own justification. Drawn
     on the button itself, not the pill wrapper around it, so it frames the
     button specifically; the pill's own `border-band-line` is unrelated and
     untouched. */
  return (
    <button
      type="submit"
      disabled={pending}
      className="relative isolate inline-flex shrink-0 items-center gap-2 overflow-hidden rounded-full border-2 border-accent bg-band px-4 py-2.5 text-sm font-medium text-band-ink transition-colors before:absolute before:inset-0 before:-z-10 before:origin-left before:[transform:scaleX(0)] before:bg-accent before:transition-transform before:duration-700 before:ease-out before:content-[''] hover:before:[transform:scaleX(1)] focus-visible:before:[transform:scaleX(1)] disabled:opacity-60 sm:px-5 dark:bg-white dark:text-band"
    >
      {/* The arrow goes at 390px, where the button was eating enough of the
          pill to clip the placeholder mid-word. The spinner is not decoration —
          it is the only signal the form is working — so it shows at every width. */}
      {pending ? (
        <SpinnerIcon className="h-4 w-4" />
      ) : (
        <ArrowRightIcon className="hidden h-4 w-4 sm:block" />
      )}
      {pending ? "Signing up…" : "Subscribe"}
    </button>
  );
}

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

          {/* Three layers, same idiom as the hero: a flat floor for the narrow
              layout where the copy spans the full width, a horizontal gradient
              for the wide one where it stays left, and a vertical pass to stop
              the pale sky washing out the heading. */}
          <div aria-hidden className="absolute inset-0 bg-scrim/44 lg:bg-scrim/18" />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-scrim/86 via-scrim/68 to-scrim/26"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-scrim/32 to-transparent"
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
                      part of the picture it lands on. */}
                  <div className="mt-3 flex items-center gap-2 rounded-full border border-band-line bg-band p-1.5 pl-5 transition-colors focus-within:border-band-accent">
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
                      className="min-w-0 flex-1 bg-transparent py-2 text-band-ink placeholder:text-band-muted focus:outline-none"
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

  /* `text-band` on `bg-band-accent`, not white: white on the accent green is
     1.9:1. Both tokens are theme-invariant, so this pair holds in both. */
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex shrink-0 items-center gap-2 rounded-full bg-band-accent px-4 py-2.5 text-sm font-medium text-band transition-opacity hover:opacity-90 disabled:opacity-60 sm:px-5"
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

"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { sendEnquiryAction, type EnquiryState } from "@/app/(site)/actions";

/**
 * The contact form.
 *
 * Four fields and nothing else. Every extra field on an enquiry form is a
 * reason not to fill it in, and the two things Vkon actually needs — what
 * you are after and where you are — are prompted for in the message
 * placeholder rather than broken into selects the visitor has to decode.
 *
 * On success the form is replaced by its confirmation. `useActionState` does
 * not reset a form, so leaving it up would show "we have your enquiry" above
 * the message still sitting in the box, which reads as if it had not sent.
 *
 * The honeypot, the rate limit and the validation all live in the action —
 * this is a POST endpoint anyone can reach directly, so nothing here is a
 * control, only a convenience.
 *
 * **Built for an ordinary page surface.** It briefly sat over a photograph and
 * used `band-*` tokens throughout; the contact page moved the artwork into a
 * masthead on 2026-08-19 and the form back onto `surface`, so these are page
 * tokens again. If it is ever put over artwork, every colour here has to flip
 * back — muted grey on a dark photograph is unreadable, and so is the reverse.
 */
export function EnquiryForm() {
  const uid = useId();
  const [state, formAction] = useActionState<EnquiryState, FormData>(
    sendEnquiryAction,
    { status: "idle" },
  );

  if (state.status === "ok") {
    return (
      <div
        role="status"
        className="flex max-w-xl items-start gap-4 border border-accent bg-accent-soft px-6 py-6"
      >
        <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <p className="font-medium text-ink">{state.message}</p>
          <p className="mt-2 text-sm leading-relaxed text-body">
            We’ll reply on the number or address you gave, through the working
            day. Urgent? Call — it’s faster than a form.
          </p>
        </div>
      </div>
    );
  }

  const error = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-6">
      {state.message && (
        <p
          role="alert"
          className="flex items-center gap-2 border-l-2 border-red-600 bg-surface-subtle px-4 py-3 text-sm text-red-700"
        >
          <AlertIcon className="h-4 w-4 shrink-0" />
          {state.message}
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id={`${uid}-name`} label="Your name" error={error("name")} required>
          <input
            id={`${uid}-name`}
            name="name"
            autoComplete="name"
            required
            maxLength={120}
            className={input(error("name"))}
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
            className={input(error("phone"))}
          />
        </Field>
      </div>

      <Field id={`${uid}-email`} label="Email" error={error("email")} required>
        <input
          id={`${uid}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          className={input(error("email"))}
        />
      </Field>

      <Field
        id={`${uid}-message`}
        label="What do you need?"
        hint="The product or job, the rating or size, and your location is usually enough."
        error={error("message")}
        required
      >
        <textarea
          id={`${uid}-message`}
          name="message"
          rows={6}
          required
          maxLength={4000}
          placeholder="e.g. a starter for a 7.5 HP borewell pump, an industrial panel, or home automation — plus your location…"
          className={`${input(error("message"))} resize-y leading-relaxed`}
        />
      </Field>

      {/* Hidden from people and from assistive technology, but present in the
          DOM for anything filling every field it finds. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <SubmitButton />

      <p className="text-sm text-muted">
        We use what you send here to answer you and nothing else.
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  /* `ui/Button`, not a bespoke `<button>` (client, 2026-08-27: "the send
     enquiry button should have the same loading animation as in explore
     products and download our brochure in about us page") — those are
     `ui/Button`'s `sweep` prop, so this switches to the shared component
     rather than re-implementing the sweep a second time. `variant="primary"`
     (the default) is `bg-action text-action-ink hover:bg-action-hover`,
     which is exactly what the bespoke button already had, so the resting and
     hover colours are unchanged; only the sweep and the size preset
     (`lg`: `px-6`/`text-[0.9375rem]`, a close but not pixel-identical match
     to the old `px-8`/`text-sm`) are new, the latter accepted for
     consistency with the two other sweep buttons rather than kept bespoke. */
  return (
    <Button type="submit" disabled={pending} size="lg" sweep>
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Sending…" : "Send enquiry"}
    </Button>
  );
}

function input(error?: string): string {
  /* `bg-surface-subtle`, not `bg-surface`: the form sits inside a white card
     on the meadow canvas (contact page, 2026-08-19), so a surface-coloured
     field would match the ground outside the card and read as a hole punched
     through it. `surface-subtle` is one meadow step down, visible against the
     white card without leaving the palette.

     `relative z-10` (client, 2026-08-27: "no glow on the input boxes... but
     the text where it describes what to enter... that should glow") — the
     enquiry card's `tilt-glare` is `absolute inset-0` with no `z-index`,
     which CSS stacking rules put *above* ordinary in-flow content regardless
     of DOM order, so without this the glow washes over every field despite
     `bg-surface-subtle` already being opaque. `z-10` lifts just the field
     itself above that layer; the label and hint text in `Field` above each
     one are untouched and still show the glow, which is the point — this is
     scoped to the input/textarea element only, not its wrapping `Field`. */
  return `relative z-10 w-full border bg-surface-subtle px-3.5 py-3 text-ink placeholder:text-muted focus:outline-none focus:ring-1 ${
    error
      ? "border-red-600 focus:border-red-600 focus:ring-red-600"
      : "border-line-strong focus:border-ink focus:ring-ink"
  }`;
}

function Field({
  id,
  label,
  hint,
  error,
  required = false,
  optional = false,
  children,
}: {
  id: string;
  label: string;
  /** A full sentence, rendered as a block under the label. */
  hint?: string;
  error?: string;
  required?: boolean;
  /** One word, rendered inline in the label. See the note below. */
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* "Optional" is inline in the label, not a block hint under it. As a
          block it added a line to this field and none to the one beside it, so
          Name and Phone sat at different heights in the same row. Block hints
          are for sentences; one-word qualifiers belong in the label. */}
      <label htmlFor={id} className="label-tech block text-muted">
        {label}
        {/* The asterisk is decorative — `required` on the control is what a
            screen reader announces, so this must not be read out as "star". */}
        {required && (
          <span aria-hidden className="ml-1 text-accent">
            *
          </span>
        )}
        {optional && <span className="ml-2 normal-case">(optional)</span>}
      </label>
      {hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
      {error && (
        <p className="mt-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}

"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { sendEnquiryAction, type EnquiryState } from "@/app/(site)/actions";

/**
 * The contact form.
 *
 * Four fields and nothing else. Every extra field on an enquiry form is a
 * reason not to fill it in, and the two things Vkon actually needs — what motor
 * you are running and where you are — are prompted for in the message
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
 * **Built for the dark band, not a light surface.** It sits over a photograph
 * with a scrim, so every colour here is a `band-*` token. Dropping it onto a
 * pale section would render muted-grey labels on near-white. `band` and
 * `band-accent` are theme-invariant, which is why the button pair holds in
 * both themes without a `dark:` variant.
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
        className="flex max-w-xl items-start gap-4 border border-band-accent bg-scrim/80 px-6 py-6"
      >
        <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-band-accent" />
        <div>
          <p className="font-medium text-band-ink">{state.message}</p>
          <p className="mt-2 text-sm leading-relaxed text-band-body">
            We read these through the working day and reply on the same number
            or address you gave us. If it is urgent, call — that is always
            faster than a form.
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
          className="flex items-center gap-2 border-l-2 border-signal-500 bg-scrim/80 px-4 py-3 text-sm text-band-ink"
        >
          <AlertIcon className="h-4 w-4 shrink-0 text-signal-500" />
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
        hint="Motor rating, supply type and your location is usually enough."
        error={error("message")}
        required
      >
        <textarea
          id={`${uid}-message`}
          name="message"
          rows={6}
          required
          maxLength={4000}
          placeholder="I run a 7.5 HP submersible on three phase near Kolar and want a panel with dry run protection…"
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

      <p className="text-sm text-band-muted">
        We use what you send here to answer you and nothing else.
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      /* `text-band` on `bg-band-accent`, not white: white on the accent green
         is 1.9:1. Both tokens are theme-invariant, so the pair holds in light
         and dark without a variant. */
      className="inline-flex h-12 items-center justify-center gap-2 bg-band-accent px-8 text-sm font-medium text-band transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Sending…" : "Send enquiry"}
    </button>
  );
}

function input(error?: string): string {
  return `w-full border bg-band-raised px-3.5 py-3 text-band-ink placeholder:text-band-muted focus:outline-none ${
    error
      ? "border-signal-500 focus:border-signal-500"
      : "border-band-line focus:border-band-accent"
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
      <label htmlFor={id} className="label-tech block text-band-muted">
        {label}
        {/* The asterisk is decorative — `required` on the control is what a
            screen reader announces, so this must not be read out as "star". */}
        {required && (
          <span aria-hidden className="ml-1 text-band-accent">
            *
          </span>
        )}
        {optional && <span className="ml-2 normal-case">(optional)</span>}
      </label>
      {hint && <p className="mt-1.5 text-sm text-band-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
      {error && (
        <p className="mt-2 text-sm text-signal-500">{error}</p>
      )}
    </div>
  );
}

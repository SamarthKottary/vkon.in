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

      <p className="text-sm text-muted">
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
      /* `text-action-ink`, never `text-white`: the action colour inverts
         between themes and a hard-coded white disappears on the light-on-dark
         button the dark theme uses. ARCHITECTURE §9. */
      className="inline-flex h-12 items-center justify-center gap-2 bg-action px-8 text-sm font-medium text-action-ink transition-colors hover:bg-action-hover disabled:opacity-60"
    >
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Sending…" : "Send enquiry"}
    </button>
  );
}

function input(error?: string): string {
  return `w-full border bg-surface px-3.5 py-3 text-ink placeholder:text-muted focus:outline-none focus:ring-1 ${
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

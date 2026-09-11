/**
 * Labelled form field, shared by every account and checkout form.
 *
 * **`contact/EnquiryForm` deliberately keeps its own copy.** That form sits
 * inside a card with a `tilt-glare` layer over it, and its input class carries
 * two things that exist only for that: `bg-surface-subtle`, so the field does
 * not read as a hole punched through the white card onto the canvas behind,
 * and `relative z-10`, to lift the control above the glare layer that CSS
 * stacking otherwise paints over it while leaving the label glowing. Neither
 * applies here, and folding them into a shared component would mean carrying a
 * page's decoration into six forms that have none. The *structure* below is
 * the same on purpose, so the two look identical without being coupled.
 */

export function fieldInput(error?: string): string {
  return `w-full border bg-surface px-3.5 py-3 text-ink placeholder:text-muted focus:outline-none focus:ring-1 ${
    error
      ? "border-red-600 focus:border-red-600 focus:ring-red-600"
      : "border-line-strong focus:border-ink focus:ring-ink"
  }`;
}

export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  optional = false,
  className = "",
  children,
}: {
  id: string;
  label: string;
  /** A full sentence, rendered as a block under the label. */
  hint?: string;
  error?: string;
  required?: boolean;
  /** One word, rendered inline in the label — a block would add a line to this
   *  field and none to the one beside it, leaving two fields in a row sitting
   *  at different heights. */
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label-tech block text-muted">
        {label}
        {/* Decorative: `required` on the control is what a screen reader
            announces, so this must not also be read out as "star". */}
        {required && (
          <span aria-hidden className="ml-1 text-accent">
            *
          </span>
        )}
        {optional && <span className="ml-2 normal-case">(optional)</span>}
      </label>
      {hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

/** The honeypot, in one place. A field no human sees and no human fills;
 *  filled means a bot, and the action it belongs to returns the ordinary
 *  success message so the bot learns nothing. Hidden from assistive
 *  technology as well as from sight — a screen-reader user is a human. */
export function Honeypot() {
  return (
    <input
      type="text"
      name="company"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
    />
  );
}

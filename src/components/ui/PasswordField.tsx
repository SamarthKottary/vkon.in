"use client";

import { useId, useState } from "react";
import { CheckIcon, CloseIcon } from "@/components/icons/ui";
import { Field, fieldInput } from "@/components/ui/Field";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  PASSWORD_RULES,
  checkPassword,
  passwordStrength,
  /* `password-policy`, NOT `password` — the latter imports `node:crypto` for
     scrypt, and pulling it into this client component blanks the whole login
     page: `promisify` is a stub in the browser, so `promisify(scryptCb)` throws
     at module evaluation before anything renders. The stack names the
     `promisify` line rather than the import that caused it, which is what makes
     it hard to spot. See that file's header. */
} from "@/lib/password-policy";

/**
 * A password field with the requirements shown, ticking as they are met.
 *
 * **This component is the mitigation for the composition rules**, not
 * decoration. `lib/password.ts` explains why those rules exist against NIST's
 * current advice; the cost of them is entirely in how they are presented.
 * Rules that are invisible until submit produce "your password is not strong
 * enough" with no statement of what would be, and somebody guessing at it from
 * a phone on a weak connection, one round trip at a time. Rules that tick as
 * you type are a different experience with the same policy behind them.
 *
 * It reads the rules from `lib/password.ts` rather than restating them, so the
 * checklist and the server's verdict cannot drift.
 *
 * **The value is held in state and never leaves the browser.** It is a plain
 * `name`d input inside the form, so the value posts with the form in the
 * ordinary way; the state exists only to drive the checklist.
 */
export function PasswordField({
  name = "password",
  label = "Password",
  autoComplete = "new-password",
  error,
  required = true,
  autoFocus = false,
  confirm = false,
  confirmLabel = "Confirm password",
  confirmError,
}: {
  name?: string;
  label?: string;
  autoComplete?: string;
  error?: string;
  required?: boolean;
  autoFocus?: boolean;
  /** Adds a second box that has to match, posted as `confirmPassword`. On by
   *  request wherever a password is *chosen* (client, 2026-09-16); never on
   *  sign-in, where there is nothing to mistype against. */
  confirm?: boolean;
  confirmLabel?: string;
  confirmError?: string;
}) {
  const uid = useId();
  const [value, setValue] = useState("");
  const [again, setAgain] = useState("");
  const [revealed, setRevealed] = useState(false);
  /** The checklist appears once they start, not on a pristine form — five
   *  unticked requirements under an empty box reads as five errors. */
  const [touched, setTouched] = useState(false);

  const met = checkPassword(value);
  const strength = passwordStrength(value);
  const allMet = PASSWORD_RULES.every((rule) => met[rule.key]);
  const show = touched || value.length > 0 || Boolean(error);

  return (
    <Field id={`${uid}-pw`} label={label} error={error} required={required}>
      <div className="relative">
        <input
          id={`${uid}-pw`}
          name={name}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          autoFocus={autoFocus}
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-describedby={show ? `${uid}-rules` : undefined}
          className={`${fieldInput(error)} pr-20`}
        />
        {/* Visible text, not an icon with an aria-label — §9's rule that an
            accessible name must lead with what is on screen, so voice control
            can say what it sees. */}
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="absolute inset-y-0 right-0 px-3 text-xs font-semibold uppercase tracking-wider text-muted transition-colors hover:text-ink"
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </div>

      {show && (
        <div id={`${uid}-rules`} className="mt-3">
          <Meter strength={strength} allMet={allMet} />

          <ul className="mt-3 space-y-1.5">
            {PASSWORD_RULES.map((rule) => (
              <li
                key={rule.key}
                className={`flex items-center gap-2 text-sm transition-colors ${
                  met[rule.key] ? "text-accent" : "text-muted"
                }`}
              >
                {met[rule.key] ? (
                  <CheckIcon className="h-4 w-4 shrink-0" />
                ) : (
                  <CloseIcon className="h-4 w-4 shrink-0 opacity-50" />
                )}
                {rule.label}
                {/* The tick is colour *and* a different glyph: colour alone
                    would carry the whole meaning for anyone who cannot
                    distinguish these two greens. */}
                <span className="sr-only">
                  {met[rule.key] ? " — done" : " — still needed"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirm && (
        <div className="mt-5">
          <label
            htmlFor={`${uid}-again`}
            className="label-tech block text-xs font-semibold uppercase tracking-wider text-muted"
          >
            {confirmLabel}
            {required && <span className="ml-1 text-accent">*</span>}
          </label>

          <input
            id={`${uid}-again`}
            name="confirmPassword"
            /* Follows the reveal above rather than having its own: two
               independent Show buttons on one pair of boxes is a puzzle, and
               the point of revealing is to compare them. */
            type={revealed ? "text" : "password"}
            autoComplete={autoComplete}
            required={required}
            maxLength={PASSWORD_MAX}
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            aria-describedby={again ? `${uid}-match` : undefined}
            aria-invalid={(again.length > 0 ? again !== value : Boolean(confirmError)) || undefined}
            className={`${fieldInput(confirmError)} mt-2`}
          />

          {/* Said as soon as there is something to say, so a mistype is caught
              at the keyboard rather than by a round trip. The server checks it
              again regardless — this is help, not the gate.

              **What is typed now outranks what the server last said.** Holding
              on to a rejected submit's error while somebody fixes the box
              leaves them staring at "must be the same" over two boxes that now
              do match, with no way to tell whether it worked — found by a flow
              test doing exactly that. The colour still comes from the server's
              verdict, so a corrected field reads as a correction rather than
              as fresh praise. */}
          {(confirmError || again.length > 0) && (
            <p
              id={`${uid}-match`}
              className={`mt-2 flex items-center gap-2 text-sm ${
                again.length === 0 || again !== value
                  ? confirmError
                    ? "text-red-700"
                    : "text-muted"
                  : "text-accent"
              }`}
            >
              {again.length > 0 && again === value ? (
                <>
                  <CheckIcon className="h-4 w-4 shrink-0" />
                  Both entries match.
                </>
              ) : again.length > 0 ? (
                <>
                  <CloseIcon className={`h-4 w-4 shrink-0 ${confirmError ? "" : "opacity-50"}`} />
                  These do not match yet.
                </>
              ) : (
                <>
                  <CloseIcon className="h-4 w-4 shrink-0" />
                  {confirmError}
                </>
              )}
            </p>
          )}
        </div>
      )}
    </Field>
  );
}

const LABELS = ["", "Weak", "Fair", "Good", "Strong"] as const;

/**
 * The meter.
 *
 * Four segments rather than a continuous bar, because a bar invites the
 * question "how full does it need to be?" and the answer is "it does not" —
 * the checklist is the gate, and this only says whether the password is
 * *better* than the minimum. It says so out loud once every rule is met:
 * length past the minimum is what actually buys anything, and nothing in the
 * requirements above asks for it.
 */
function Meter({ strength, allMet }: { strength: number; allMet: boolean }) {
  const tone =
    strength >= 4
      ? "bg-accent"
      : strength === 3
        ? "bg-accent"
        : strength === 2
          ? "bg-signal-500"
          : "bg-red-500";

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className={`h-1 flex-1 transition-colors ${
                strength >= step ? tone : "bg-line"
              }`}
            />
          ))}
        </div>
        <span
          className={`w-14 shrink-0 text-right text-xs font-semibold uppercase tracking-wider ${
            strength >= 3 ? "text-accent" : strength === 2 ? "text-signal-700" : "text-muted"
          }`}
        >
          {LABELS[strength] || ""}
        </span>
      </div>

      {allMet && strength < 3 && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          That will do — but a longer one is much harder to guess. Three or four
          words you will remember beats eight clever characters.
        </p>
      )}
    </div>
  );
}

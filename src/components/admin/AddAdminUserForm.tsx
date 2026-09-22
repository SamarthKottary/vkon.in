"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { Field, fieldInput } from "@/components/ui/Field";
import { createAdminUserAction, type ActionState } from "@/app/admin/actions";
import type { AdminRole } from "@/lib/types";

const ROLE_OPTIONS: { value: AdminRole; label: string; desc: string }[] = [
  { value: "super", label: "Super User", desc: "Full access" },
  { value: "admin", label: "Admin", desc: "Full access except SEO" },
  { value: "support", label: "Support", desc: "Advance orders, view everything" },
  { value: "viewer", label: "Viewer", desc: "Read-only" },
];

export function AddAdminUserForm({ currentRole }: { currentRole: string }) {
  const uid = useId();
  const [state, formAction] = useActionState<ActionState, FormData>(
    createAdminUserAction,
    {},
  );

  const availableRoles =
    currentRole === "super"
      ? ROLE_OPTIONS
      : ROLE_OPTIONS.filter((r) => r.value === "support" || r.value === "viewer");

  if (state.ok) {
    return (
      <div
        role="status"
        className="flex items-start gap-2 border border-accent bg-accent-soft px-4 py-3 text-sm text-ink"
      >
        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <span>
          User added. They will be prompted to set their password the first time
          they sign in.
        </span>
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-md space-y-5">
      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 border-l-2 border-red-600 bg-surface-subtle px-4 py-3 text-sm text-red-700"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      <Field id={`${uid}-name`} label="Name" error={state.fieldErrors?.name} required>
        <input
          id={`${uid}-name`}
          name="name"
          required
          maxLength={120}
          className={fieldInput(state.fieldErrors?.name)}
        />
      </Field>

      <Field id={`${uid}-email`} label="Email address" error={state.fieldErrors?.email} required>
        <input
          id={`${uid}-email`}
          name="email"
          type="email"
          required
          className={fieldInput(state.fieldErrors?.email)}
        />
      </Field>

      <Field id={`${uid}-role`} label="Role" error={state.fieldErrors?.role} required>
        <select
          id={`${uid}-role`}
          name="role"
          defaultValue="viewer"
          className={`${fieldInput(state.fieldErrors?.role)} bg-surface`}
        >
          {availableRoles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label} — {r.desc}
            </option>
          ))}
        </select>
      </Field>

      <p className="text-xs leading-relaxed text-muted">
        No password is set initially. The user will be asked to create one the
        first time they sign in at /admin.
      </p>

      <AddButton />
    </form>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Adding…" : "Add user"}
    </Button>
  );
}

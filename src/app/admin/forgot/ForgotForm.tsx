"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { forgotAdminPasswordAction } from "./actions";

export function ForgotForm() {
  const [state, action, isPending] = useActionState(forgotAdminPasswordAction, {});

  if (state.ok) {
    return (
      <div className="text-center">
        <p className="font-medium text-accent">Check your email</p>
        <p className="mt-2 text-sm text-body">{state.error}</p>
      </div>
    );
  }

  return (
    <form action={action}>
      <Field
        label="Email address"
        error={state.fieldErrors?.email}
        className="mb-6"
      >
        <Input
          type="email"
          name="email"
          required
          autoComplete="email"
          autoFocus
          defaultValue={state.values?.email}
        />
      </Field>

      {state.error && !state.ok && (
        <p className="mb-6 text-sm font-medium text-red-600">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Sending..." : "Send me a link"}
      </Button>
    </form>
  );
}

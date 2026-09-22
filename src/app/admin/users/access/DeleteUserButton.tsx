"use client";

import { useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { deleteAdminUserAction } from "@/app/admin/actions";
import { SpinnerIcon } from "@/components/icons/ui";

function ConfirmButton({ name, roleName }: { name: string; roleName: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="border border-red-600 bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
    >
      {pending ? (
        <span className="flex items-center gap-1.5">
          <SpinnerIcon className="h-3 w-3" /> Deleting…
        </span>
      ) : (
        `Yes, delete ${name} as ${roleName}`
      )}
    </button>
  );
}

export function DeleteUserButton({
  id,
  name,
  roleName,
}: {
  id: string;
  name: string;
  roleName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function arm() {
    setConfirming(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setConfirming(false), 5000);
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={arm}
        className="border border-red-200 bg-surface px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
      >
        Remove
      </button>
    );
  }

  return (
    <form action={deleteAdminUserAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-xs text-red-600 font-medium">Are you sure?</span>
      <ConfirmButton name={name} roleName={roleName} />
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-muted hover:text-ink underline px-1"
      >
        Cancel
      </button>
    </form>
  );
}

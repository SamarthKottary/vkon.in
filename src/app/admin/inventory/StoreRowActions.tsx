"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRightIcon, BanIcon, EyeIcon, PencilIcon, SpinnerIcon, TrashIcon } from "@/components/icons/ui";
import type { Store } from "@/lib/types";
import { blockStoreAction, deleteStoreAction, impersonateStoreAction } from "./actions";

/**
 * **View · Edit · Block · Delete**, at the right of a store's row (client,
 * 2026-09-26).
 *
 * The same marks as the user cards use, for the same reason: the row is
 * identical on every store, so the icon carries the meaning and only the
 * destructive control is coloured. Delete arms and confirms — it takes a store
 * and everything it was recorded as holding, and there is nothing to undo it
 * with.
 */
export function StoreRowActions({
  store,
  showView = true,
}: {
  store: Store;
  /** False on the store's own page, where View would point at itself. */
  showView?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocked = Boolean(store.blockedAt);

  function arm() {
    setConfirming(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setConfirming(false), 5000);
  }

  if (confirming) {
    return (
      <form action={deleteStoreAction} className="flex items-center gap-1">
        <input type="hidden" name="id" value={store.id} />
        <ConfirmDelete nickname={store.nickname} />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="h-9 px-2 text-sm text-muted transition-colors hover:text-ink"
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <form action={impersonateStoreAction} target="_blank">
        <input type="hidden" name="id" value={store.id} />
        <input type="hidden" name="slug" value={store.slug} />
        <button
          type="submit"
          className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap px-2 text-sm font-medium text-ink transition-colors hover:text-accent"
        >
          <ArrowRightIcon className="h-[1.1rem] w-[1.1rem]" />
          Login
          <span className="sr-only"> as {store.nickname}</span>
        </button>
      </form>
      {showView && (
        <Link
          href={`/admin/inventory/${store.slug}`}
          className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap px-2 text-sm font-medium text-ink transition-colors hover:text-accent"
        >
          <EyeIcon className="h-[1.1rem] w-[1.1rem]" />
          View
          <span className="sr-only"> {store.nickname}</span>
        </Link>
      )}

      <Link
        href={`/admin/inventory/${store.slug}/edit`}
        className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap px-2 text-sm font-medium text-ink transition-colors hover:text-accent"
      >
        <PencilIcon className="h-[1.1rem] w-[1.1rem]" />
        Edit
        <span className="sr-only"> {store.nickname}</span>
      </Link>

      <form action={blockStoreAction}>
        <input type="hidden" name="id" value={store.id} />
        <input type="hidden" name="block" value={blocked ? "0" : "1"} />
        <button
          type="submit"
          className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap px-2 text-sm font-medium transition-colors ${
            blocked ? "text-accent hover:text-accent-strong" : "text-ink hover:text-signal-700"
          }`}
        >
          <BanIcon className="h-[1.1rem] w-[1.1rem]" />
          {blocked ? "Unblock" : "Block"}
          <span className="sr-only"> {store.nickname}</span>
        </button>
      </form>

      <button
        type="button"
        onClick={arm}
        aria-label={`Delete ${store.nickname}`}
        title={`Delete ${store.nickname}`}
        className="inline-flex h-9 items-center px-2 text-red-600 transition-colors hover:text-red-700"
      >
        <TrashIcon className="h-[1.1rem] w-[1.1rem]" />
      </button>
    </div>
  );
}

function ConfirmDelete({ nickname }: { nickname: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center gap-1.5 border border-red-600 bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
    >
      {pending ? <SpinnerIcon className="h-4 w-4" /> : <TrashIcon className="h-4 w-4" />}
      {pending ? "Deleting…" : "Delete store"}
      <span className="sr-only"> {nickname}</span>
    </button>
  );
}

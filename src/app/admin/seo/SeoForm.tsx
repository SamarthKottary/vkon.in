"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, SpinnerIcon } from "@/components/icons/ui";
import { SEO_PAGES } from "@/lib/seo";
import type { PageSeo } from "@/lib/db/pageSeo";
import { savePageSeoAction, type ActionState } from "../actions";

export function SeoForm({ initial }: { initial: Record<string, PageSeo> }) {
  const uid = useId();
  const [state, formAction] = useActionState<ActionState, FormData>(
    savePageSeoAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-8">
      {state.error && (
        <p
          role="alert"
          className="flex gap-2 border-l-2 border-red-600 bg-surface px-4 py-3 text-sm text-red-700"
        >
          <AlertIcon className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      {state.ok && (
        <p
          role="alert"
          className="flex gap-2 border-l-2 border-green-600 bg-surface px-4 py-3 text-sm text-green-700"
        >
          SEO overrides saved successfully.
        </p>
      )}

      <div className="space-y-8">
        {SEO_PAGES.map((page, index) => {
          const seo = initial[page.path] || { title: "", description: "" };
          const idPrefix = `${uid}-${index}`;
          return (
            <section key={page.path} className="border border-line bg-surface">
              <div className="border-b border-line px-6 py-4">
                <h2 className="text-base font-medium text-ink">{page.label}</h2>
                <p className="mt-1 font-mono text-sm text-muted">{page.path}</p>
              </div>
              <div className="space-y-5 p-6">
                <input type="hidden" name="path" value={page.path} />
                
                <div>
                  <label htmlFor={`${idPrefix}-title`} className="label-tech block text-muted">
                    Meta title
                  </label>
                  <p className="mt-1 text-sm text-muted">Around 60 characters. Blank falls back to the default.</p>
                  <div className="mt-2">
                    <input
                      id={`${idPrefix}-title`}
                      name="title"
                      defaultValue={seo.title}
                      maxLength={70}
                      className="w-full border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor={`${idPrefix}-description`} className="label-tech block text-muted">
                    Meta description
                  </label>
                  <p className="mt-1 text-sm text-muted">Around 155 characters. Blank falls back to the default.</p>
                  <div className="mt-2">
                    <textarea
                      id={`${idPrefix}-description`}
                      name="description"
                      defaultValue={seo.description}
                      rows={3}
                      maxLength={200}
                      className="w-full resize-y border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                    />
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-line pt-6">
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-sm bg-action px-6 text-sm font-medium text-action-ink hover:bg-action-hover disabled:opacity-50"
    >
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

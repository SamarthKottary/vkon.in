"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertIcon,
  ImageIcon,
  SpinnerIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons/ui";
import { protectionMeta } from "@/components/icons/protections";
import { categoriesInSector, PROTECTION_KEYS, sectors } from "@/content/taxonomy";
import type { Product, ProductImage } from "@/lib/types";
import { saveProductAction, uploadImageAction, type ActionState } from "../actions";

/**
 * Product editor.
 *
 * Images are the only part that talks to the server before submit: each upload
 * posts immediately and returns a URL, which is then carried in hidden fields
 * so the whole product still saves in one action. That keeps the form
 * recoverable — a failed save never loses already-uploaded files.
 *
 * List fields (ratings, features, spec) are plain one-per-line textareas rather
 * than repeater widgets. For a handful of products a textarea is faster to fill
 * in and impossible to get into a broken state.
 */
export function ProductForm({ product }: { product?: Product }) {
  const uid = useId();
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveProductAction,
    {},
  );
  const [images, setImages] = useState<ProductImage[]>(product?.images ?? []);

  const fieldError = (name: string) => state.fieldErrors?.[name];

  return (
    <form action={formAction} className="space-y-8">
      {product && <input type="hidden" name="id" value={product.id} />}

      {state.error && (
        <p
          role="alert"
          className="flex gap-2 border-l-2 border-red-600 bg-surface px-4 py-3 text-sm text-red-700"
        >
          <AlertIcon className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}

      <Panel title="Basics">
        <Field
          id={`${uid}-name`}
          label="Product name"
          required
          error={fieldError("name")}
        >
          <input
            id={`${uid}-name`}
            name="name"
            defaultValue={product?.name}
            required
            placeholder="EC-DOL"
            className={input(fieldError("name"))}
          />
        </Field>

        <Field
          id={`${uid}-slug`}
          label="URL"
          hint="Leave blank to build it from the name."
          error={fieldError("slug")}
        >
          <div className="flex items-center">
            <span className="border border-r-0 border-line-strong bg-surface-subtle px-3 py-2.5 font-mono text-sm text-muted">
              /products/
            </span>
            <input
              id={`${uid}-slug`}
              name="slug"
              defaultValue={product?.slug}
              placeholder="ec-dol"
              className={`${input(fieldError("slug"))} font-mono`}
            />
          </div>
        </Field>

        <Field id={`${uid}-category`} label="Category" required>
          <select
            id={`${uid}-category`}
            name="category"
            defaultValue={product?.category ?? "starter"}
            className={input()}
          >
            {/* Grouped by market. Flat, the list gives no hint which of the
                three a category belongs to, and choosing wrongly files the
                product under the wrong card on the home page. */}
            {sectors.map((sector) => {
              const options = categoriesInSector(sector.key);
              if (options.length === 0) return null;
              return (
                <optgroup key={sector.key} label={sector.label}>
                  {options.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </Field>

        <Field
          id={`${uid}-tagline`}
          label="Tagline"
          hint="One line, shown on the catalogue card."
        >
          <input
            id={`${uid}-tagline`}
            name="tagline"
            defaultValue={product?.tagline}
            placeholder="Three phase DOL starter with full protection"
            className={input()}
          />
        </Field>

        <Field
          id={`${uid}-description`}
          label="Description"
          hint="Leave a blank line between paragraphs."
        >
          <textarea
            id={`${uid}-description`}
            name="description"
            defaultValue={product?.description}
            rows={7}
            className={`${input()} resize-y leading-relaxed`}
          />
        </Field>
      </Panel>

      <Panel
        title="Images"
        note="First image is used on the catalogue card. JPEG, PNG, WebP or AVIF, up to 8 MB."
      >
        <ImageManager images={images} onChange={setImages} />
      </Panel>

      <Panel title="Video" note="Paste a YouTube or Vimeo link. Nothing loads from them until a visitor presses play.">
        <Field id={`${uid}-videoUrl`} label="Video URL" error={fieldError("videoUrl")}>
          <input
            id={`${uid}-videoUrl`}
            name="videoUrl"
            type="url"
            defaultValue={product?.videoUrl ?? ""}
            placeholder="https://www.youtube.com/watch?v=..."
            className={input(fieldError("videoUrl"))}
          />
        </Field>

        <Field id={`${uid}-videoTitle`} label="Video caption">
          <input
            id={`${uid}-videoTitle`}
            name="videoTitle"
            defaultValue={product?.videoTitle ?? ""}
            placeholder="Installation and settings walkthrough"
            className={input()}
          />
        </Field>
      </Panel>

      <Panel title="Specification">
        <Field
          id={`${uid}-hpRanges`}
          label="Motor ratings"
          hint="One per line. These become the catalogue filter."
        >
          <textarea
            id={`${uid}-hpRanges`}
            name="hpRanges"
            defaultValue={product?.hpRanges.join("\n")}
            rows={3}
            placeholder={"3 – 7.5 HP\n10 HP"}
            className={`${input()} resize-y font-mono text-[0.8125rem]`}
          />
        </Field>

        <Field
          id={`${uid}-spec`}
          label="Specification table"
          hint="One per line, as “Label: value”."
        >
          <textarea
            id={`${uid}-spec`}
            name="spec"
            defaultValue={product?.spec.map((s) => `${s.label}: ${s.value}`).join("\n")}
            rows={5}
            placeholder={"Type: DOL\nSupply: 3 Phase, 280 – 440 V\nWarranty: 6 months"}
            className={`${input()} resize-y font-mono text-[0.8125rem]`}
          />
        </Field>

        <Field id={`${uid}-features`} label="Features" hint="One per line.">
          <textarea
            id={`${uid}-features`}
            name="features"
            defaultValue={product?.features.join("\n")}
            rows={6}
            className={`${input()} resize-y`}
          />
        </Field>
      </Panel>

      <Panel
        title="Protection"
        note="Tick what this panel protects against. Each one renders with its icon and explanation on the product page."
      >
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {PROTECTION_KEYS.map((key) => (
            <li key={key}>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="protections"
                  value={key}
                  defaultChecked={product?.protections.includes(key)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                />
                <span className="text-ink">{protectionMeta[key].label}</span>
              </label>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="SEO"
        note="Optional. Controls how this product looks in Google and when its link is shared. Leave blank to use the name and tagline."
      >
        <Field
          id={`${uid}-seoTitle`}
          label="Meta title"
          hint="Around 60 characters. Blank uses the product name."
        >
          <input
            id={`${uid}-seoTitle`}
            name="seoTitle"
            defaultValue={product?.seoTitle}
            maxLength={70}
            placeholder={product?.name || "EC-DOL Starter — 3 phase, full protection"}
            className={input()}
          />
        </Field>

        <Field
          id={`${uid}-seoDescription`}
          label="Meta description"
          hint="Around 155 characters. Blank uses the tagline."
        >
          <textarea
            id={`${uid}-seoDescription`}
            name="seoDescription"
            defaultValue={product?.seoDescription}
            rows={3}
            maxLength={200}
            placeholder={
              product?.tagline ||
              "Three phase DOL starter with dry run, phase reversal and voltage protection."
            }
            className={`${input()} resize-y`}
          />
        </Field>
      </Panel>

      <Panel title="Publishing">
        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="published"
              defaultChecked={product ? product.published : true}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span>
              <span className="font-medium text-ink">Published</span>
              <span className="mt-0.5 block text-muted">
                Visible on the site. Uncheck to keep it as a draft.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="featured"
              defaultChecked={product?.featured}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span>
              <span className="font-medium text-ink">Featured</span>
              <span className="mt-0.5 block text-muted">
                Show on the home page.
              </span>
            </span>
          </label>
        </div>

        {/* Catalogue order is set from the product list's drag handles, not
            here — a number typed once tends to drift from what the list
            actually shows the moment two products swap places. */}
      </Panel>

      <div className="flex items-center gap-3 border-t border-line pt-6">
        <SaveButton isEdit={Boolean(product)} />
        <Link
          href="/admin/products"
          className="px-4 py-2 text-sm text-muted hover:text-ink"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function ImageManager({
  images,
  onChange,
}: {
  images: ProductImage[];
  onChange: (next: ProductImage[]) => void;
}) {
  const [uploadState, uploadAction, uploading] = useActionState(
    async (_prev: { error?: string }, formData: FormData) => {
      const result = await uploadImageAction({}, formData);
      if (result.uploaded) {
        onChange([...images, { url: result.uploaded.url, alt: "", pathname: result.uploaded.pathname }]);
        return {};
      }
      return { error: result.error };
    },
    {},
  );

  const [urlDraft, setUrlDraft] = useState("");

  return (
    <div className="space-y-5">
      {images.length > 0 && (
        <ul className="space-y-3">
          {images.map((image, index) => (
            <li
              key={`${image.url}-${index}`}
              className="flex items-start gap-4 border border-line bg-surface p-3"
            >
              {/* Hidden fields are how the images reach the save action. */}
              <input type="hidden" name="imageUrl" value={image.url} />
              <input type="hidden" name="imagePathname" value={image.pathname ?? ""} />

              <div className="relative h-16 w-16 shrink-0 border border-line bg-surface-subtle">
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="4rem"
                  className="object-contain p-1"
                />
              </div>

              <div className="min-w-0 flex-1">
                <label className="label-tech block text-muted">
                  Alt text
                  <input
                    name="imageAlt"
                    defaultValue={image.alt}
                    placeholder="EC-DOL control panel, front view"
                    className="mt-1.5 w-full border border-line-strong bg-surface px-2.5 py-2 font-sans text-sm normal-case tracking-normal text-ink focus:border-ink focus:outline-none"
                  />
                </label>
                {index === 0 && (
                  <p className="label-tech mt-2 text-accent">Catalogue image</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => onChange(images.filter((_, i) => i !== index))}
                aria-label="Remove image"
                className="border border-line-strong p-2 text-muted hover:border-red-400 hover:text-red-700"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {uploadState.error && (
        <p role="alert" className="flex gap-2 text-sm text-red-700">
          <AlertIcon className="h-4 w-4 shrink-0" />
          {uploadState.error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {/* Nested <form> is illegal, so uploading uses a label + hidden input
            that posts through its own action via requestSubmit on change. */}
        <label className="inline-flex cursor-pointer items-center gap-2 border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:border-ink">
          {uploading ? (
            <SpinnerIcon className="h-4 w-4" />
          ) : (
            <UploadIcon className="h-4 w-4" />
          )}
          {uploading ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const data = new FormData();
              data.set("file", file);
              uploadAction(data);
              event.target.value = "";
            }}
          />
        </label>

        <div className="flex min-w-64 flex-1 items-center gap-2">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="…or paste an image URL"
            className="min-w-0 flex-1 border border-line-strong bg-surface px-3 py-2.5 text-sm focus:border-ink focus:outline-none"
          />
          <button
            type="button"
            disabled={!urlDraft.trim()}
            onClick={() => {
              onChange([...images, { url: urlDraft.trim(), alt: "" }]);
              setUrlDraft("");
            }}
            className="inline-flex items-center gap-1.5 border border-line-strong px-3 py-2.5 text-sm text-ink hover:border-ink disabled:opacity-40"
          >
            <ImageIcon className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-sm bg-action px-6 text-sm font-medium text-action-ink hover:bg-action-hover disabled:opacity-50"
    >
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
    </button>
  );
}

// ---------------------------------------------------------------------------

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line bg-surface">
      <div className="border-b border-line px-6 py-4">
        <h2 className="text-base font-medium text-ink">{title}</h2>
        {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      </div>
      <div className="space-y-5 p-6">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label-tech block text-muted">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </label>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function input(error?: string) {
  return `w-full border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 ${
    error
      ? "border-red-500 focus:border-red-600 focus:ring-red-600"
      : "border-line-strong focus:border-ink focus:ring-ink"
  }`;
}

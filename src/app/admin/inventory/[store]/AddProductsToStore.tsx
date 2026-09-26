"use client";

import { useRef } from "react";
import type { GstRates } from "@/lib/pricing";
import { addStoreProductsAction } from "../actions";
import { StoreProductPicker, type PickerProduct } from "../StoreProductPicker";

/**
 * **Add products** on a store that already exists: the picker, and a form for
 * its answer to travel in.
 *
 * The picker hands back ids; this puts them in a hidden field and submits, so
 * the write is an ordinary server action rather than a fetch — one code path
 * with the new-store form, and it works the same way if the page is reloaded
 * mid-thought.
 */
export function AddProductsToStore({
  storeId,
  products,
  held,
  rates,
}: {
  storeId: string;
  products: PickerProduct[];
  held: string[];
  rates: GstRates;
}) {
  const form = useRef<HTMLFormElement | null>(null);
  const field = useRef<HTMLInputElement | null>(null);

  return (
    <form action={addStoreProductsAction} ref={form}>
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="productIds" ref={field} />
      <StoreProductPicker
        products={products}
        held={held}
        rates={rates}
        saveLabel="Save products"
        onSave={(ids) => {
          if (!field.current) return;
          field.current.value = ids.join(",");
          requestAnimationFrame(() => form.current?.requestSubmit());
        }}
      />
    </form>
  );
}

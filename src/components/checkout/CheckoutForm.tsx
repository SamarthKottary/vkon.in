"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
} from "@/components/icons/ui";
import { AddressForm } from "@/components/account/AddressForm";
import { PanelPlaceholder } from "@/components/product/PanelPlaceholder";
import { Button } from "@/components/ui/Button";
import { clearCart } from "@/lib/cart";
import { useCartLines } from "@/components/cart/useCart";
import { formatPaise, priceLines, totals } from "@/lib/pricing";
import {
  deleteAddressAction,
  placeOrderAction,
  quoteDeliveryAction,
  type CheckoutState,
  type DeliveryQuoteState,
} from "@/app/(site)/account/private-actions";
import type { DeliveryOption } from "@/lib/shiprocket";
import type { Address, Product } from "@/lib/types";

/**
 * Checkout: bill to, ship to, check the total, place the order.
 *
 * **The cart lives in `localStorage`, so the server cannot see it.** That is
 * `lib/cart.ts`'s deliberate design — no account needed to fill a basket — and
 * it means the lines have to be posted with the form. They go as slugs and
 * quantities in a hidden field and nothing more: `placeOrderAction` re-resolves
 * them against the live catalogue and re-prices them through the same
 * `lib/pricing` functions this component uses to draw the totals below. So the
 * figures on screen and the figures on the order come from one implementation,
 * and a tampered form field can change *what* is ordered but never what it
 * costs.
 *
 * **Nothing in the left-hand column is inside the order form.** It cannot be:
 * that column holds the add, edit and delete forms for the address book, and a
 * `<form>` inside a `<form>` is invalid HTML — the parser drops the inner tag
 * outright, so the inner Save button submits the *outer* form and saving an
 * address places an order. The order form is the summary panel on the right;
 * everything the customer chose reaches it through the hidden inputs there,
 * driven by the state below. This is why the note field is controlled rather
 * than left to the DOM: it lives in the left column and its value has to be
 * mirrored across.
 *
 * **The cart is cleared after the redirect, not before the submit.** Clearing
 * it first would empty somebody's basket on a failed order and leave them with
 * nothing to retry.
 */
export function CheckoutForm({
  products,
  addresses,
}: {
  products: Product[];
  addresses: Address[];
}) {
  const uid = useId();
  const formId = `${uid}-order`;
  const lines = useCartLines();
  const [state, formAction] = useActionState<CheckoutState, FormData>(placeOrderAction, {
    status: "idle",
  });

  const preferred = () => addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "";

  const [billingId, setBillingId] = useState(preferred);
  const [shippingId, setShippingId] = useState(preferred);
  /**
   * Ticked by default, because for nearly everybody the two are the same place
   * and the client's ordering — billing first, shipping second — only makes
   * sense if the second step is usually a formality.
   */
  const [sameAsBilling, setSameAsBilling] = useState(true);

  /** Which address panel is open, if any. One at a time: two open forms are
   *  two Save buttons and no way to tell which is which. */
  const [editor, setEditor] = useState<Editor | null>(() =>
    addresses.length === 0 ? { section: "billing", addressId: null } : null,
  );

  const priced = useMemo(() => priceLines(lines ?? [], products), [lines, products]);

  /**
   * The last delivery quote the server returned, tagged with what it was for.
   *
   * **Stored with its key, and "loading" is derived from that rather than
   * stored.** The obvious shape — a `quote` state reset to `null` at the top
   * of the effect — needs a synchronous `setState` inside that effect, which
   * is what `react-hooks/set-state-in-effect` exists to stop and what this
   * codebase has been bitten by twice (§9). Keeping the answer's key beside it
   * means a result for a destination the customer has already moved off simply
   * does not match, and reads as "still asking" with nothing written.
   */
  const [quoted, setQuoted] = useState<{ key: string; value: DeliveryQuoteState } | null>(
    null,
  );

  /* Units, not line count — "1 item" beside a subtotal for two of the same
     panel reads as a miscount, and a customer checking this figure is
     counting what they are paying for, not how many distinct products that
     comes from. */
  const totalQty = priced.reduce((sum, line) => sum + line.qty, 0);

  const billing = addresses.find((a) => a.id === billingId) ?? null;

  /**
   * Keeps the two selections pointing at rows that still exist.
   *
   * Every address mutation here goes through a server action that
   * `revalidatePath`s this route, so a save or a delete arrives as a new
   * `addresses` prop rather than as local state. Two things have to happen when
   * it does: a *deleted* address must not stay selected — the order would fail
   * server-side with "please choose an address" pointing at a card that is no
   * longer on screen — and a *newly added* one should become the selection for
   * whichever section asked for it, which is the only reason anybody opens that
   * form mid-checkout.
   *
   * The new row is found by id difference rather than by taking the first or
   * the newest: `listAddresses` sorts default-first, so ticking "use this as my
   * default" while adding moves the new row to the top and any positional guess
   * would be wrong exactly when the customer was most explicit.
   */
  const knownIds = useRef<Set<string>>(new Set(addresses.map((a) => a.id)));
  const awaiting = useRef<Section | null>(null);
  useEffect(() => {
    const ids = new Set(addresses.map((a) => a.id));
    const added = addresses.find((a) => !knownIds.current.has(a.id));
    knownIds.current = ids;

    if (added && awaiting.current) {
      if (awaiting.current === "billing") setBillingId(added.id);
      else setShippingId(added.id);
      awaiting.current = null;
    }

    const fallback = addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "";
    setBillingId((current) => (current && ids.has(current) ? current : fallback));
    setShippingId((current) => (current && ids.has(current) ? current : fallback));
  }, [addresses]);

  /**
   * Asks the server what delivery costs, whenever the destination changes.
   *
   * The destination is the shipping address, or the billing one while "ship to
   * the billing address" is ticked — so changing *either* selection, or the
   * checkbox, re-quotes.
   *
   * **The sequence number is what makes this correct.** Two quotes can be in
   * flight at once (tick the box, untick it, pick another address), and they
   * can come back in any order; without the guard a slow answer for the
   * address the customer has already moved off would overwrite the right one,
   * and the figure on screen would be for somewhere else. Only the newest
   * request is allowed to write.
   *
   * `cartKey` rather than `lines`: the array is a fresh object on every render
   * of the parent, and using it directly would re-quote on every keystroke
   * elsewhere on the page.
   */
  const destinationId = sameAsBilling ? billingId : shippingId;
  const cartKey = JSON.stringify(priced.map((line) => [line.slug, line.qty]));
  const quoteKey = `${destinationId}|${cartKey}`;
  const canQuote = Boolean(destinationId) && priced.length > 0;

  /**
   * What the Delivery row shows.
   *
   * `null` is "still asking" and renders as "Calculating…"; a settled
   * `unavailable` renders as the phone-call wording. Both are derived, so
   * nothing here writes state during a render or an effect.
   */
  const quote: DeliveryQuoteState | null = !canQuote
    ? { status: "unavailable" }
    : quoted?.key === quoteKey
      ? quoted.value
      : null;

  const options = quote?.status === "quoted" ? quote.options : [];

  /**
   * Which delivery service is selected.
   *
   * Held as an id rather than an index, because the list is refetched whenever
   * the address or the cart changes and an index would silently point at a
   * different courier. An id that is no longer offered simply stops matching,
   * and the cheapest — `options[0]`, since the list is price-sorted — takes
   * over, which is also the default before anything is chosen.
   */
  const [courierId, setCourierId] = useState<number | null>(null);
  const chosen =
    options.find((o) => o.courierId === courierId) ?? options[0] ?? null;

  const shippingPaise = chosen?.ratePaise ?? 0;

  /* Declared after the quote because it depends on it: the delivery charge is
     part of the total the moment the courier gives one. */
  const money = useMemo(() => totals(priced, shippingPaise), [priced, shippingPaise]);

  /**
   * The sequence guard on top of the key.
   *
   * The key alone decides what is *displayed*; this decides what is allowed to
   * be *written*. Two quotes can be in flight at once — tick the box, untick
   * it, pick another address — and they can come back in any order. Without
   * this, a slow answer for an address the customer has already moved off
   * would land last and leave the panel showing "Calculating…" forever,
   * because its key no longer matches.
   */
  const quoteSeq = useRef(0);
  useEffect(() => {
    if (!canQuote) return;

    const seq = ++quoteSeq.current;
    const key = quoteKey;

    quoteDeliveryAction({
      addressId: destinationId,
      lines: JSON.parse(cartKey).map(([slug, qty]: [string, number]) => ({ slug, qty })),
    })
      .then((value) => {
        if (seq === quoteSeq.current) setQuoted({ key, value });
      })
      .catch(() => {
        /* A network failure is not the customer's problem: fall back to the
           wording the site used before live rates existed. */
        if (seq === quoteSeq.current) setQuoted({ key, value: { status: "unavailable" } });
      });
  }, [canQuote, quoteKey, destinationId, cartKey]);

  /**
   * Empties the basket once the order has actually been placed.
   *
   * The action redirects on success, so this component unmounts and never sees
   * a success state to react to — which is why the clear is triggered by the
   * *navigation away* rather than by a returned status. `sessionStorage` marks
   * the attempt so a customer who lands back here by pressing Back does not
   * have the cart cleared out from under a failed order.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem("vkon-order-placed")) {
        window.sessionStorage.removeItem("vkon-order-placed");
        clearCart();
      }
    } catch {
      /* Private mode. The cart keeps its contents, which is a nuisance and not
         a fault — nothing is double-ordered by it. */
    }
  }, []);

  if (lines === null) {
    /* Storage has not been read yet. Rendering "your cart is empty" for this
       frame would flash it at somebody who has three things in theirs — the
       contract `useCartLines` states. */
    return <div className="h-64" aria-hidden />;
  }

  if (priced.length === 0) {
    return (
      <div className="border border-line bg-surface-raised px-6 py-16 text-center shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-subtle text-muted">
          <PanelPlaceholder className="h-7 w-7" />
        </span>
        <p className="mt-5 text-lg font-bold text-ink">Your cart is empty</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Add something from the catalogue and it will show up here.
        </p>
        <Link
          href="/products"
          className="mt-7 inline-flex h-11 items-center justify-center bg-accent px-6 text-sm font-bold uppercase tracking-wider text-surface shadow-sm transition-colors hover:bg-accent-strong"
        >
          Browse products
        </Link>
      </div>
    );
  }

  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const ready = Boolean(billingId) && (sameAsBilling || Boolean(shippingId));

  const openEditor = (section: Section, addressId: string | null) => {
    if (addressId === null) awaiting.current = section;
    setEditor({ section, addressId });
    if (addressId !== null) {
      if (section === "billing") setBillingId(addressId);
      if (section === "shipping") setShippingId(addressId);
    }
  };

  const addressPanel = (section: Section) => {
    if (!editor || editor.section !== section) return null;
    const editing = addresses.find((a) => a.id === editor.addressId);
    return (
      <div className="mt-5 border border-line-strong bg-surface-raised p-5 shadow-card sm:p-6">
        <h3 className="mb-6 text-sm font-semibold uppercase tracking-wider text-ink">
          {editing ? "Edit address" : "New address"}
        </h3>
        {/* Its own `<form>` — see the note at the top of this file for why the
            order form cannot be an ancestor of this element. */}
        <AddressForm
          key={editing?.id ?? "new"}
          address={editing}
          onDone={() => {
            setEditor(null);
          }}
          onCancel={
            addresses.length > 0
              ? () => {
                  awaiting.current = null;
                  setEditor(null);
                }
              : undefined
          }
        />
      </div>
    );
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-12">
      <div className="min-w-0 space-y-10">
        {state.status === "error" && state.message && (
          <p
            role="alert"
            className="flex items-start gap-2 border-l-2 border-red-600 bg-surface-subtle px-4 py-3 text-sm text-red-700"
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {state.message}
          </p>
        )}

        {/* 1 — Billing. First because it is the one an invoice is made out to
            and the one a GSTIN belongs to; the delivery step below defaults to
            repeating it. */}
        <section>
          <StepHeading
            step={1}
            title="Billing address"
            hint="Whom the invoice is made out to. Add a GSTIN here if you are buying in a business's name."
          />

          {addresses.length > 0 && (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {addresses.map((address) => (
                <li key={address.id} className="min-w-0">
                  <AddressCard
                    address={address}
                    group={`${uid}-billing`}
                    selected={billingId === address.id}
                    onSelect={() => {
                      setBillingId(address.id);
                      if (editor?.section === "billing" && editor.addressId !== null) {
                        setEditor({ section: "billing", addressId: address.id });
                      }
                    }}
                    onEdit={() => openEditor("billing", address.id)}
                    showGstin
                  />
                </li>
              ))}
            </ul>
          )}

          {editor?.section === "billing" ? (
            addressPanel("billing")
          ) : (
            <AddAddressButton onClick={() => openEditor("billing", null)} />
          )}
        </section>

        {/* 2 — Shipping. */}
        <section>
          <StepHeading
            step={2}
            title="Shipping address"
            hint="Where the goods actually go. Untick the box if that is somewhere else."
          />

          <label className="mt-6 flex cursor-pointer items-start gap-3 border border-line bg-surface-subtle p-4 text-sm">
            <input
              type="checkbox"
              checked={sameAsBilling}
              onChange={(event) => setSameAsBilling(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
            />
            <span>
              <span className="font-medium text-ink">
                Ship to the billing address
              </span>
              {billing && sameAsBilling && (
                <span className="mt-1 block leading-relaxed text-muted">
                  {billing.line1}, {billing.city}, {billing.state}{" "}
                  {billing.postalCode}
                </span>
              )}
            </span>
          </label>

          {!sameAsBilling && (
            <>
              {addresses.length > 0 && (
                <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                  {addresses.map((address) => (
                    <li key={address.id} className="min-w-0">
                      <AddressCard
                        address={address}
                        group={`${uid}-shipping`}
                        selected={shippingId === address.id}
                        onSelect={() => {
                          setShippingId(address.id);
                          if (editor?.section === "shipping" && editor.addressId !== null) {
                            setEditor({ section: "shipping", addressId: address.id });
                          }
                        }}
                        onEdit={() => openEditor("shipping", address.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {editor?.section === "shipping" ? (
                addressPanel("shipping")
              ) : (
                <AddAddressButton onClick={() => openEditor("shipping", null)} />
              )}
            </>
          )}
        </section>

        {/* 3 — What is being bought. */}
        <section>
          <StepHeading step={3} title="Your order" />

          <ul className="mt-6 divide-y divide-line border border-line bg-surface-raised shadow-card">
            {priced.map((line) => {
              const product = bySlug.get(line.slug);
              const image = product?.images[0];
              return (
                /* The line total drops under the unit price below `sm`
                   instead of sitting in a third column. At 390px, once the
                   thumbnail and a two-line product name have taken their
                   width, there is not enough left for a rupee figure beside
                   them — the two ran into each other. */
                <li key={line.slug} className="flex items-start gap-3 p-4 sm:items-center sm:gap-4 sm:p-5">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden border border-line bg-surface-subtle">
                    {image ? (
                      <Image
                        src={image.url}
                        alt=""
                        fill
                        sizes="4rem"
                        className="object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-muted">
                        <PanelPlaceholder className="h-6 w-6" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-ink sm:text-base">
                      {line.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-sm text-muted">
                        {formatPaise(line.unitPrice)} × {line.qty}
                      </p>
                      <p className="font-bold tabular-nums text-ink sm:hidden">
                        {formatPaise(line.lineTotal)}
                      </p>
                    </div>
                  </div>
                  <p className="hidden shrink-0 font-bold tabular-nums text-ink sm:block">
                    {formatPaise(line.lineTotal)}
                  </p>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-sm text-muted">
            Need to change quantities?{" "}
            <Link href="/cart" className="text-accent hover:underline">
              Back to the cart
            </Link>
            .
          </p>
        </section>
      </div>

      {/* The order form itself. Small on purpose: hidden fields carrying the
          choices made on the left, the totals, and the one submit button. */}
      <form
        id={formId}
        action={formAction}
        onSubmit={() => {
          /* Marked here, acted on by the effect above after the redirect has
             landed. Doing the clear itself here would empty the basket even
             when the order fails validation on the server. */
          try {
            window.sessionStorage.setItem("vkon-order-placed", "1");
          } catch {
            /* Private mode — see the effect. */
          }
        }}
        className="border border-line bg-surface p-5 shadow-card sm:p-6 lg:sticky lg:top-24"
      >
        {/* What the server re-resolves. Prices are deliberately absent: the
            browser has no say in what anything costs. */}
        <input
          type="hidden"
          name="lines"
          value={JSON.stringify(priced.map((line) => ({ slug: line.slug, qty: line.qty })))}
        />
        <input type="hidden" name="billingAddressId" value={billingId} />
        <input type="hidden" name="shippingAddressId" value={sameAsBilling ? "" : shippingId} />
        {sameAsBilling && <input type="hidden" name="sameAsBilling" value="on" />}
        <input type="hidden" name="notes" value="" />
        {/* The *id* of the chosen service, never its price. The server looks it
            up in a quote it fetches itself, so the worst this field can do is
            pick a different real service at its real cost. */}
        <input type="hidden" name="courierId" value={chosen?.courierId ?? ""} />

        <h2 className="border-b border-line pb-4 text-lg font-bold uppercase tracking-wider text-ink">
          Order total
        </h2>

        <div className="divide-y divide-line text-sm">
          <Row
            label={`Subtotal · ${totalQty} item${totalQty === 1 ? "" : "s"}`}
            value={formatPaise(money.subtotal)}
            strong
          />
          <Row label="CGST 9%" value={formatPaise(money.cgst)} />
          <Row label="SGST 9%" value={formatPaise(money.sgst)} />
          {/* Three states, and each is honest about what is known. A real
              rate once the courier has given one; "Calculating…" while the
              request is out; and the phone-call wording when there is no
              number — an unserviceable PIN code, a courier API that timed out,
              or no Shiprocket account configured at all. The last of those is
              exactly what this row said before live rates existed, so an
              unconfigured site is unchanged. */}
          {quote === null ? (
            <Row label="Delivery" value="Calculating…" />
          ) : options.length === 0 ? (
            <Row label="Delivery" value="Quoted on our call" />
          ) : options.length === 1 ? (
            /* One service on offer is not a choice — showing it as a radio
               with nothing to compare against is a decision the customer
               cannot make. */
            <Row
              label={deliveryLabel(options[0])}
              value={formatPaise(options[0].ratePaise)}
            />
          ) : (
            <div className="py-3">
              <p className="mb-2 text-muted">Delivery</p>
              <ul className="space-y-2">
                {options.map((option, index) => {
                  const selected = chosen?.courierId === option.courierId;
                  return (
                    <li key={option.courierId}>
                      <label
                        className={`flex cursor-pointer items-start gap-2.5 border p-2.5 transition-colors ${
                          selected
                            ? "border-accent bg-accent-soft/40"
                            : "border-line hover:border-line-strong"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`${uid}-courier`}
                          checked={selected}
                          onChange={() => setCourierId(option.courierId)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="font-medium text-ink">
                              {serviceName(index, options.length)}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-ink">
                              {formatPaise(option.ratePaise)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-muted">
                            {option.estimatedDays
                              ? `~${option.estimatedDays} days · ${option.courierName}`
                              : option.courierName}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 py-4 text-base font-bold">
            <span className="text-ink">Total</span>
            <span className="text-xl font-bold tabular-nums text-accent sm:text-2xl">
              {formatPaise(money.total)}
            </span>
          </div>
        </div>

        {billing?.gstin && (
          <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
            Invoiced to{" "}
            <span className="font-mono font-medium text-ink">{billing.gstin}</span>
          </p>
        )}

        <PlaceOrder disabled={!ready} />

        {!ready && (
          <p className="mt-3 text-center text-sm text-muted">
            {billingId
              ? "Choose a shipping address to continue."
              : "Choose a billing address to continue."}
          </p>
        )}

        {/* The second sentence follows the quote. Promising to agree the
            delivery charge on the call is true only while there is no charge
            on screen — once a courier has priced it, saying so anyway reads as
            though the figure above might still change. */}
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Placing the order does not take a payment.{" "}
          {quote?.status === "quoted"
            ? "Delivery is priced above. We call you to confirm the details before dispatch."
            : "We call you to confirm the details and the delivery charge first."}
        </p>
      </form>
    </div>
  );
}

type Section = "billing" | "shipping";
type Editor = { section: Section; addressId: string | null };

/**
 * What a delivery service is called: by its place in the shortlist, never by
 * whether it flies. `shortlistDeliveryOptions` returns them cheapest first and
 * each strictly quicker than the one before, so position *is* speed.
 *
 * Shiprocket's air/surface flag is not. Labelled from it, a Mangaluru order
 * offered "Express, ~2 days" for ₹49.72 above "Standard, ~1 day" for ₹73.44 —
 * Xpressbees by air against Blue Dart by road — and a Delhi one showed two
 * different services both called "Standard".
 */
function serviceName(index: number, count: number): string {
  if (index === 0) return "Standard";
  return index === count - 1 ? "Express" : "Faster";
}

/** "Delivery · Standard, ~3 days" — the wording when there is nothing to choose. */
function deliveryLabel(option: DeliveryOption): string {
  return option.estimatedDays
    ? `Delivery · Standard, ~${option.estimatedDays} days`
    : "Delivery · Standard";
}

function StepHeading({
  step,
  title,
  hint,
}: {
  step: number;
  title: string;
  hint?: string;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-3 text-lg font-semibold text-ink sm:text-xl">
        {/* Decorative — the heading text already reads in order, and a screen
            reader announcing "one billing address" helps nobody.
            Filled rather than outlined: as a 7px-bordered box holding muted
            text it read as a disabled input at a glance, not as step one of
            three. */}
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center bg-ink text-sm font-bold text-surface"
        >
          {step}
        </span>
        {title}
      </h2>
      {hint && (
        <p className="mt-2 max-w-xl pl-11 text-sm leading-relaxed text-muted">{hint}</p>
      )}
    </div>
  );
}

/**
 * One saved address, as a selectable card with its own edit and delete.
 *
 * The `<label>` covers the radio and the address only. Wrapping the buttons in
 * it too would make "Edit" also select the card — a label forwards its click to
 * its control — and "Delete" select it on the way out.
 */
function AddressCard({
  address,
  group,
  selected,
  onSelect,
  onEdit,
  showGstin = false,
}: {
  address: Address;
  group: string;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  showGstin?: boolean;
}) {
  return (
    <div
      className={`flex h-full flex-col border bg-surface-raised transition-colors ${
        selected ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong"
      }`}
    >
      <label className="flex flex-1 cursor-pointer gap-3 p-4">
        <input
          type="radio"
          name={group}
          value={address.id}
          checked={selected}
          onChange={onSelect}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-ink">{address.name}</span>
            {address.isDefault && (
              <span className="label-tech flex items-center gap-1 text-accent">
                <PinIcon className="h-3 w-3" />
                Default
              </span>
            )}
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-body">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ""}
            <br />
            {address.city}, {address.state} {address.postalCode}
            <br />
            {address.phone}
          </span>
          {showGstin && address.gstin && (
            <span className="label-tech mt-2 block break-all text-muted">
              GSTIN {address.gstin}
            </span>
          )}
        </span>
      </label>

      <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-sm">
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 text-accent hover:underline"
        >
          <PencilIcon className="h-3.5 w-3.5" />
          Edit
        </button>

        <form
          action={deleteAddressAction}
          /* A plain `confirm()`, the same as the address book's — see the note
             there. Deleting one is entirely recoverable by typing it again. */
          onSubmit={(event) => {
            if (!window.confirm(`Delete the address for ${address.name}?`)) {
              event.preventDefault();
            }
          }}
          className="ml-auto"
        >
          <input type="hidden" name="id" value={address.id} />
          <button
            type="submit"
            className="flex items-center gap-1.5 text-muted hover:text-red-700"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}

function AddAddressButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 inline-flex items-center gap-2 border border-line-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle"
    >
      <PlusIcon className="h-4 w-4" />
      Add an address
    </button>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <span className={`min-w-0 ${strong ? "font-semibold text-ink" : "text-muted"}`}>
        {label}
      </span>
      <span
        className={`shrink-0 tabular-nums ${strong ? "font-semibold text-ink" : "font-medium text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}

function PlaceOrder({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      size="lg"
      variant="accent"
      className="mt-6 w-full"
    >
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Placing your order…" : "Place order"}
    </Button>
  );
}

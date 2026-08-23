import { site } from "@/content/site";
import type { Product } from "./types";

/**
 * Contact link builders.
 *
 * WhatsApp links are prefilled deliberately: an enquiry that already names the
 * panel and rating can be quoted without a round trip.
 */

export function whatsAppLink(message?: string): string {
  const base = `https://wa.me/${site.whatsapp}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function telLink(): string {
  return `tel:${site.phone.href}`;
}

export function mailtoLink(subject?: string): string {
  const base = `mailto:${site.email}`;
  return subject ? `${base}?subject=${encodeURIComponent(subject)}` : base;
}

export function productEnquiryMessage(product: Product): string {
  const hp = product.hpRanges.length ? ` (${product.hpRanges.join(", ")})` : "";
  return `Hello ${site.name}, I would like to know the price and availability of the ${product.name}${hp}.`;
}

/**
 * The prefilled message behind every general WhatsApp button — the floating
 * one, the mobile action bar, the footer and `ContactStrip`.
 *
 * Deliberately names no range. It said "your motor starters" until 2026-08-24,
 * which was written when that was the whole catalogue; it now also holds
 * industrial panels, solar, cables, accessories and home automation, and the
 * button sits on every page including the ones about those. A visitor reading
 * the About page and tapping WhatsApp should not find themselves asking about
 * starters.
 *
 * `productEnquiryMessage` is where specificity belongs: it is sent from one
 * product's page and names that product.
 */
export const generalEnquiryMessage = `Hello ${site.name}, I would like to know more about your products.`;

/** Google Maps search link for the address in `site.ts`. */
export function mapsLink(): string {
  const query = [
    site.legalName,
    site.address.street,
    site.address.locality,
    site.address.region,
    site.address.postalCode,
  ].join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

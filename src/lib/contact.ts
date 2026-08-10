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

export const generalEnquiryMessage = `Hello ${site.name}, I would like to know more about your motor starters.`;

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

import type { CategoryMeta, ProductCategory, ProtectionKey } from "@/lib/types";

/**
 * Fixed vocabularies the admin picks from.
 *
 * These stay in code rather than the database: they are tied to icons and to
 * copy, so adding one is a code change either way. Everything a non-developer
 * needs to change about a product lives in the database.
 */

export const categories: CategoryMeta[] = [
  {
    key: "starter",
    label: "Motor Starters",
    description:
      "Digital control panels for single and three phase agricultural pumps.",
  },
  {
    key: "solar",
    label: "Solar Systems",
    description:
      "Controllers that run a pump on solar, on mains, or switch between them.",
  },
  {
    key: "auto-start",
    label: "Auto Start Units",
    description: "Standalone timers and preventors that add auto-start to any starter.",
  },
  {
    key: "cable",
    label: "Cables",
    description: "Submersible cable built for continuous underwater duty.",
  },
  {
    key: "accessory",
    label: "Accessories",
    description: "Mobile control units and add-ons for the Vkon range.",
  },
];

export const CATEGORY_KEYS = categories.map((c) => c.key) as ProductCategory[];

export function categoryLabel(key: ProductCategory | string): string {
  return categories.find((c) => c.key === key)?.label ?? String(key);
}

export function isCategory(value: unknown): value is ProductCategory {
  return (
    typeof value === "string" && (CATEGORY_KEYS as string[]).includes(value)
  );
}

export const PROTECTION_KEYS = [
  "dry-run",
  "hv-lv",
  "phase-reversal",
  "single-phase",
  "overload-relay",
  "rotary-lock",
  "auto-start-timer",
  "cyclic-timer",
  "voltage-current-sensing",
  "star-delta",
  "mobile-control",
  "solar-powered",
] as const satisfies readonly ProtectionKey[];

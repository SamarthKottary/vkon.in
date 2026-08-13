import type { CategoryMeta, ProductCategory, ProtectionKey } from "@/lib/types";

/**
 * Fixed vocabularies the admin picks from.
 *
 * These stay in code rather than the database: they are tied to icons and to
 * copy, so adding one is a code change either way. Everything a non-developer
 * needs to change about a product lives in the database.
 */

/*
 * TODO(vkon): the longer descriptions below are drafted from the company's own
 * product portfolio and read well on the cards, but only the motor starter copy
 * is written from confirmed material. Solar is listed in that document as a
 * future product line, and there is very little source material on the cable
 * and accessory ranges — confirm all three before launch.
 */
export const categories: CategoryMeta[] = [
  {
    key: "starter",
    label: "Motor Starters",
    description:
      "Digital control panels for single and three phase agricultural pumps, from 1 HP direct-on-line units through star-delta and fully automatic star-delta panels up to 40 HP. Every panel is wired, inspected and tested in house, with dry run, single phasing, overload and voltage protection acting on all three phases.",
    image: "/categories/starter.jpg",
  },
  {
    key: "solar",
    label: "Solar Systems",
    description:
      "Controllers that run a pump on solar, on mains, or change over between the two automatically as the day allows. The same protection set watches the motor whichever source is driving it, so a cloudy afternoon or a weak feeder is handled without anyone standing at the pump house deciding what to switch and when.",
    image: "/categories/solar.jpg",
  },
  {
    key: "auto-start",
    label: "Auto Start Units",
    description:
      "Standalone timers and preventors that add automatic starting to a starter you already own. They bring the pump back when three phase supply returns within safe limits, after an adjustable delay so it never starts into an unstable line, and will run it on a repeating cycle through the night with nobody at the pump house.",
    image: "/categories/auto-start.jpg",
  },
  {
    key: "cable",
    label: "Cables",
    description:
      "Submersible cable built for continuous underwater duty, where ordinary wiring gives way at the joint long before the conductor itself does. Matched to the panel and the motor it will run rather than chosen afterwards from whatever is on the counter, because an undersized cable quietly undoes the protection in front of it.",
    image: "/categories/cable.jpg",
  },
  {
    key: "accessory",
    label: "Accessories",
    description:
      "Mobile control units and the small parts that live around a panel — GSM modules that switch the motor by call or SMS, float switches, pressure sensors and cable glands. Specified against the panel they sit beside rather than bought to fit afterwards, which is usually where a retrofitted accessory starts causing trouble.",
    image: "/categories/accessory.jpg",
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

/**
 * The protections, grouped by what kind of thing they are.
 *
 * A flat list of twelve hides a real distinction: six are faults the panel
 * watches for, three are things it does unattended, three are how you see and
 * reach it. The /protection page is built from this.
 *
 * Group sizes (6 / 3 / 3) are chosen so every group divides evenly into both a
 * two- and a three-column grid. That is what keeps the layout free of the empty
 * trailing cells described in ARCHITECTURE.md §9 — check it before re-grouping.
 */
export const protectionGroups: {
  key: string;
  /** Category label above the heading. Not a step number — these are kinds, not a sequence. */
  eyebrow: string;
  title: string;
  intro: string;
  keys: ProtectionKey[];
}[] = [
  {
    key: "faults",
    eyebrow: "The faults",
    title: "Faults it watches for",
    intro:
      "These are the conditions that destroy pump motors. The panel watches all three phases for them continuously, and acts before the winding does.",
    keys: [
      "dry-run",
      "single-phase",
      "hv-lv",
      "phase-reversal",
      "overload-relay",
      "rotary-lock",
    ],
  },
  {
    key: "unattended",
    eyebrow: "Automation",
    title: "Runs without you",
    intro:
      "Irrigation happens when the supply allows it, which is rarely when somebody is standing at the pump house.",
    keys: ["auto-start-timer", "cyclic-timer", "star-delta"],
  },
  {
    key: "control",
    eyebrow: "Interface",
    title: "Sensing and control",
    intro: "What the panel measures, and how you reach it.",
    keys: ["voltage-current-sensing", "mobile-control", "solar-powered"],
  },
];

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

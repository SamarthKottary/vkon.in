import type { Sector } from "@/lib/types";

/**
 * Market segments shown in the rotating hero.
 *
 * These are the three **sectors**, not product categories — the same three
 * `taxonomy.ts` defines, in the same order, and `key` is typed to `Sector` so
 * the two cannot drift apart. A slide is the sector's pitch; the categories
 * inside it are the job of the cards a screen below.
 *
 * Order matters — the first one is what a visitor sees before any JavaScript
 * runs, and its headline is the page's `<h1>`. Keep agriculture first.
 *
 * TODO(vkon): only the agriculture slide is written from confirmed material
 * (the product portfolio in the company plan). Industrial and commercial are
 * both stated directions rather than shipping ranges, and the copy below is
 * written to be true of an intent rather than of a catalogue. Rewrite both once
 * there is a product list behind them. Delete a segment and the hero adjusts.
 */

export type HeroSegment = {
  key: Sector;
  /**
   * Eyebrow above the headline, and the accessible name of this slide's button
   * on the progress bar. Keep it to one or two words.
   */
  label: string;
  /** One array entry per rendered line, so the line breaks are deliberate. */
  headline: string[];
  /** The final headline line, set in the muted tone. */
  headlineTail: string;
  body: string;
  /**
   * Optional full-bleed background photograph, e.g. "/segments/agriculture.jpg"
   * in `public/`. Leave it out and the hero keeps the ruled-grid texture. The
   * hero paints a heavy scrim over the left side, so pick frames whose left
   * third is quiet — see docs/ARCHITECTURE.md for the brief.
   */
  image?: string;
  /**
   * Horizontal focal point for the background, as an `object-position` value.
   *
   * Only bites on narrow screens. A phone shows roughly a third of a landscape
   * frame, and a centre slice cut the subject out entirely — on the agriculture
   * frame it landed on empty paddy with the pump house off-screen.
   *
   * Defaults to the right edge, because every frame here was composed with its
   * subject in the right third and its left kept quiet for the headline. Set
   * this only for artwork that breaks that rule. Desktop is ~1.85:1 against a
   * 1.79:1 image, so it crops almost nothing and stays centred.
   */
  focus?: string;
};

export const heroSegments: HeroSegment[] = [
  {
    key: "agriculture",
    label: "Agriculture",
    headline: ["Protection between", "your motor and"],
    headlineTail: "the mains.",
    image: "/segments/agriculture.jpg",
    body: "Electronic starters and control panels for agricultural pumps. Built for the supply Indian borewells actually run on — phases that drop out, voltage that swings, and water that runs dry without warning.",
  },
  {
    key: "industrial",
    label: "Industrial",
    headline: ["Keep the line", "running when"],
    headlineTail: "the supply won't.",
    image: "/segments/industrial.jpg",
    // TODO(vkon): placeholder. No industrial product list exists yet.
    body: "Motor control and protection for industrial duty, where the load runs continuously and a stopped machine costs more in an afternoon than the panel driving it. The same protections, built to the ratings and enclosures a shop floor asks for.",
  },
  {
    key: "commercial",
    label: "Commercial",
    headline: ["Lights that know", "when someone"],
    headlineTail: "walks in.",
    image: "/segments/commercial.jpg",
    /* Left of centre, against the default right edge.
       This frame breaks the composition rule the default assumes: its subject —
       the lit staircase — is also the brightest thing in it, so a phone-width
       crop of the right third put white text over lit concrete and measured
       3.76:1. At 45% the crop is the shadowed wall and the opening beside it,
       which is both darker and the more atmospheric half. */
    focus: "45% 50%",
    // TODO(vkon): placeholder. Confirm what is actually offered here.
    body: "Home and building automation — a wardrobe that lights when it opens, a staircase that lights as you reach it and goes dark behind you. Wired and tested to the same standard as everything else we build.",
  },
];

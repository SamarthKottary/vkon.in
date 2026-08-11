/**
 * Market segments shown in the rotating hero.
 *
 * Order matters — the first one is what a visitor sees before any JavaScript
 * runs, and its headline is the page's `<h1>`. Keep agriculture first.
 *
 * TODO(vkon): only the agriculture slide is written from confirmed material
 * (the product portfolio in the company plan). Home automation appears nowhere
 * in that document, and solar pumping is listed there as a *future* product
 * line rather than something shipping today. Both need real copy — and, more
 * importantly, a decision about whether the site should advertise them at all
 * before there is a product to sell. Delete a segment and the hero adjusts.
 */

export type HeroSegment = {
  key: string;
  /** Shown on the progress control beneath the hero. Keep it to one or two words. */
  label: string;
  /** One array entry per rendered line, so the line breaks are deliberate. */
  headline: string[];
  /** The final headline line, set in the muted tone. */
  headlineTail: string;
  body: string;
};

export const heroSegments: HeroSegment[] = [
  {
    key: "agriculture",
    label: "Agriculture",
    headline: ["Protection between", "your motor and"],
    headlineTail: "the mains.",
    body: "Electronic starters and control panels for agricultural pumps. Built for the supply Indian borewells actually run on — phases that drop out, voltage that swings, and water that runs dry without warning.",
  },
  {
    key: "home-automation",
    label: "Home Automation",
    headline: ["Control the pump", "without walking"],
    headlineTail: "to the pump.",
    // TODO(vkon): placeholder. Confirm what is actually offered here.
    body: "Domestic pump control for homes, apartments and farmhouses. Start and stop from a phone, fill the overhead tank automatically, and keep the motor protected on the same board.",
  },
  {
    key: "solar",
    label: "Solar Pumping",
    headline: ["Run the pump", "on sunlight,"],
    headlineTail: "not on diesel.",
    // TODO(vkon): the plan lists solar pump controllers as a future product line.
    body: "Controllers that run a pump on solar, on mains, or switch between them as the day allows — with the same protection set watching the motor throughout.",
  },
];

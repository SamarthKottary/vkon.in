import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pdf, rupees } from "@/lib/pdf";
import { decodePng, type Raster } from "@/lib/png";
import { site } from "@/content/site";
import { isCod, paymentStateLabel } from "@/lib/order-payment";
import type { Order, ShipTo } from "@/lib/types";

/**
 * The customer's tax invoice, as a PDF (client, 2026-09-25 — "Download
 * invoice" had been a disabled placeholder since the order page was built).
 *
 * **Laid out after the invoice the client supplied as the reference**
 * (`ST190826125297.pdf`, a Shiprocket-issued one): logo and "Tax Invoice
 * (Original for Recipient)" across the top, the seller block against the
 * invoice's own details, Bill To beside Ship To in bordered boxes, the items
 * table, the totals stack on the right, and a declaration at the foot. What
 * differs is ours: **CGST and SGST as separate lines**, because both parties
 * are in Karnataka and that is how the split is printed, and the branding from
 * the client's own banner — Vkon Automation, *powered by G.N. Technologies*.
 *
 * **The GST number comes from `site_settings`**, entered by a super user on
 * `/admin/profile`, not from a constant here: it is a real registration that
 * changes hands, and an invoice with somebody else's number on it is worse
 * than one without.
 *
 * Money is `Rs.` rather than `₹` — see the note in `lib/pdf.ts` about what the
 * standard fonts can draw.
 */

/** A4 in points, with the margins the reference invoice uses. */
const LEFT = 42;
const RIGHT = 553;
const WIDTH = RIGHT - LEFT;

const GREY_BAND = 0.88;
const RULE = 0.65;
const MUTED = 0.35;

export type InvoiceDetails = {
  /** The seller's GSTIN, or "" when it has not been entered yet. */
  gstin: string;
  /** The customer's account email — the order carries only addresses. */
  email: string;
};

let logoCache: Raster | null | undefined;

/**
 * The Vkon wordmark, read once per process.
 *
 * `undefined` means "not tried yet", `null` means "tried and it is not
 * there" — a missing or unreadable file must not cost the customer their
 * invoice, so the header falls back to type.
 */
async function logo(): Promise<Raster | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const file = await readFile(path.join(process.cwd(), "public/brand/vkon-logo-light.png"));
    logoCache = decodePng(file);
  } catch (error) {
    console.error("[invoice] logo unavailable, using text:", error);
    logoCache = null;
  }
  return logoCache;
}

export async function renderInvoice(order: Order, details: InvoiceDetails): Promise<Buffer> {
  const pdf = new Pdf();
  const mark = await logo();

  /* ---- Header: the banner's identity, and what this document is ---- */
  if (mark) {
    const width = 132;
    pdf.image(mark, LEFT, 38, width, (width * mark.height) / mark.width);
  } else {
    pdf.text(LEFT, 42, "VKON AUTOMATION", { size: 16, bold: true });
  }
  pdf.text(LEFT, 99, "powered by G.N. Technologies", { size: 8, colour: MUTED });

  pdf.text(RIGHT, 40, "Tax Invoice", { size: 15, bold: true, align: "right" });
  pdf.text(RIGHT, 60, "(Original for Recipient)", { size: 8.5, align: "right", colour: MUTED });

  /* ---- The two parties' own details ---- */
  let y = 124;
  pdf.text(LEFT, y, "VKON AUTOMATION", { size: 10, bold: true });
  y += 15;
  for (const line of [
    site.address.street,
    `${site.address.locality}, ${site.address.region} ${site.address.postalCode}`,
    `Telephone: ${site.phone.display}`,
    `Email: ${site.email}`,
    "https://vkon.in",
    details.gstin ? `GSTIN: ${details.gstin}` : "",
  ]) {
    if (!line) continue;
    pdf.text(LEFT, y, line, { size: 8.5 });
    y += 12.5;
  }

  const metaLeft = 330;
  let metaY = 124;
  const meta = (label: string, value: string, bold = false) => {
    pdf.text(metaLeft, metaY, label, { size: 8.5, colour: MUTED });
    pdf.text(RIGHT, metaY, value, { size: 8.5, align: "right", bold });
    metaY += 13.5;
  };
  meta("Invoice date", formatDay(order.paidAt ?? order.createdAt));
  meta("Order / Invoice number", order.orderNumber, true);
  meta("Payment method", paymentMethod(order));
  meta("Place of supply", order.shipTo.state || site.address.region);

  /* ---- Bill to / Ship to ---- */
  y = Math.max(y, metaY) + 14;
  const half = WIDTH / 2;
  const bill = addressLines(order.billTo, details.email, "GSTIN");
  const ship = addressLines(order.shipTo, "", "");
  const rows = Math.max(bill.length, ship.length + (order.notes ? 1.5 : 0));
  const boxHeight = 24 + rows * 12.5 + 8;

  for (const [index, column] of [bill, ship].entries()) {
    const x = LEFT + index * half;
    pdf.rect(x, y, half, boxHeight, { stroke: RULE });
    pdf.rect(x, y, half, 20, { fill: GREY_BAND, stroke: RULE });
    pdf.text(x + 8, y + 6, index === 0 ? "Bill to" : "Ship to", { size: 9, bold: true });
    column.forEach((line, row) => pdf.text(x + 8, y + 28 + row * 12.5, line, { size: 8.5 }));
    if (index === 1 && order.notes) {
      pdf.text(x + 8, y + 28 + column.length * 12.5 + 4, `Customer note: ${order.notes}`, {
        size: 8,
        colour: MUTED,
      });
    }
  }
  y += boxHeight + 22;

  /* ---- Items ----
     Each column is fixed by the edges it sits between, so a long name or a
     six-figure amount cannot push another column off the page — the bug this
     table had on its first draft. */
  /* #22, product 185, SKU 100, qty 30, unit 82, amount 92 — the money columns
     wide enough for a lakh at 8pt, which is what a panel order costs. */
  const edges = [LEFT, LEFT + 22, LEFT + 207, LEFT + 307, LEFT + 337, LEFT + 419, RIGHT];
  const cell = (index: number) => ({ from: edges[index], to: edges[index + 1] });
  const headings: [number, string, "left" | "right"][] = [
    [0, "#", "left"],
    [1, "Product", "left"],
    [2, "SKU", "left"],
    [3, "Qty", "right"],
    [4, "Unit price", "right"],
    [5, "Amount", "right"],
  ];

  const header = () => {
    pdf.rect(LEFT, y, WIDTH, 20, { fill: GREY_BAND, stroke: RULE });
    headings.forEach(([index, label, align]) => {
      const { from, to } = cell(index);
      pdf.text(align === "right" ? to - 6 : from + 6, y + 6, label, {
        size: 8.5,
        bold: true,
        align,
      });
    });
    y += 20;
  };

  let tableTop = y;
  header();

  order.items.forEach((item, index) => {
    /* A long product name wraps, and the row grows with it. */
    const nameLines = wrap(pdf, item.name, cell(1).to - cell(1).from - 12, 8.5);
    const height = Math.max(22, 10 + nameLines.length * 11.5);
    /* An order of many items carries on overleaf rather than running into the
       declaration — the verticals are closed off first, as the page ends. */
    if (y + height > 660) {
      edges.slice(1, -1).forEach((x) => pdf.line(x, tableTop, x, y, { stroke: RULE }));
      foot(pdf, pdf.pageCount);
      pdf.newPage();
      y = 56;
      tableTop = y;
      header();
    }
    pdf.rect(LEFT, y, WIDTH, height, { stroke: RULE });
    pdf.text(cell(0).from + 6, y + 6, String(index + 1), { size: 8.5 });
    nameLines.forEach((line, row) =>
      pdf.text(cell(1).from + 6, y + 6 + row * 11.5, line, { size: 8.5 }),
    );
    pdf.text(cell(2).from + 6, y + 6, fit(pdf, item.slug, cell(2).to - cell(2).from - 12, 7.5), {
      size: 7.5,
    });
    pdf.text(cell(3).to - 6, y + 6, String(item.qty), { size: 8.5, align: "right" });
    pdf.text(cell(4).to - 6, y + 6, rupees(item.unitPrice), { size: 8, align: "right" });
    pdf.text(cell(5).to - 6, y + 6, rupees(item.lineTotal), { size: 8, align: "right" });
    y += height;
  });

  /* The verticals, drawn once the table's height is known. */
  edges.slice(1, -1).forEach((x) => pdf.line(x, tableTop, x, y, { stroke: RULE }));

  /* ---- Totals, against the item count on the left ---- */
  const quantity = order.items.reduce((sum, item) => sum + item.qty, 0);
  const totalsX = LEFT + 300;
  /* **Each order's own rates, read back from its own figures** — not today's
     setting (2026-09-25, when the rates became changeable). An invoice
     reprinted after a rate change has to say what was charged. */
  const totals: [string, string, boolean][] = [
    ["Subtotal (excl. GST)", rupees(order.subtotal), false],
    [`CGST ${percent(order.cgst, order.subtotal)}`, rupees(order.cgst), false],
    [`SGST ${percent(order.sgst, order.subtotal)}`, rupees(order.sgst), false],
    ["Delivery", order.shipping > 0 ? rupees(order.shipping) : "Not charged", false],
    ["Total", rupees(order.total), true],
  ];

  const totalsHeight = totals.length * 19;
  pdf.rect(LEFT, y, 300, totalsHeight, { stroke: RULE });
  pdf.text(LEFT + 150, y + totalsHeight / 2 - 14, "Total quantity", {
    size: 8.5,
    align: "centre",
    colour: MUTED,
  });
  pdf.text(LEFT + 150, y + totalsHeight / 2, String(quantity), { size: 11, align: "centre", bold: true });

  totals.forEach(([label, value, bold]) => {
    pdf.rect(totalsX, y, RIGHT - totalsX, 19, { stroke: RULE, fill: bold ? GREY_BAND : undefined });
    pdf.text(totalsX + 8, y + 5.5, label, { size: 8.5, bold });
    pdf.text(RIGHT - 8, y + 5.5, value, { size: 8.5, bold, align: "right" });
    y += 19;
  });
  y += 10;

  /* What the customer still owes, which an invoice should never leave to
     guesswork: a COD parcel is paid at the door, an online order is not. */
  pdf.text(RIGHT, y, paymentStanding(order), { size: 8.5, align: "right", bold: true });
  y += 26;

  /* ---- Declaration ---- */
  pdf.text(LEFT, y, "Declaration", { size: 9, bold: true });
  y += 14;
  y +=
    pdf.paragraph(
      LEFT,
      y,
      WIDTH,
      "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. " +
        "Goods once sold are taken back only under the returns policy published on vkon.in. All disputes are subject to Mangaluru jurisdiction only.",
      { size: 8, colour: 0.2 },
    ) * 11;
  y += 6;
  pdf.text(LEFT, y, `Any question about this invoice: ${site.email}`, { size: 8, colour: MUTED });

  /* ---- Signature, as on the reference invoice ----
     Low on the page, and never on top of a long declaration. */
  /* No wordmark down here (client, 2026-09-25): it is already at the top of
     the page and in the foot line, and a third one reads as a watermark.
     The note and the signature share one line (client, same day): the rule is
     what sets the height, and both captions sit under it. */
  const signTop = Math.max(y + 40, 752);
  pdf.line(RIGHT - 150, signTop, RIGHT, signTop, { stroke: 0.3 });
  pdf.text(RIGHT, signTop + 4, "Authorised Signatory", { size: 8.5, align: "right" });
  pdf.text(LEFT, signTop + 4, "(Computer generated invoice - signature not required.)", {
    size: 8.5,
    colour: 0.2,
  });

  foot(pdf, pdf.pageCount);
  return pdf.end();
}

/** The same line at the bottom of every page: who this is from, and that
 *  nobody signed it. */
function foot(pdf: Pdf, page: number): void {
  const footY = 800;
  pdf.line(LEFT, footY, RIGHT, footY, { stroke: 0.75 });
  pdf.text(LEFT, footY + 7, "Vkon Automation - powered by G.N. Technologies - www.vkon.in", {
    size: 8,
    colour: MUTED,
  });
  pdf.text(RIGHT, footY + 7, `This is a computer-generated invoice.   Page ${page}`, {
    size: 8,
    colour: MUTED,
    align: "right",
  });
}

/** `VK-0923-98FT.pdf` — what the browser calls the download. */
export function invoiceFilename(order: Order): string {
  return `Invoice-${order.orderNumber}.pdf`;
}

function addressLines(address: ShipTo, email: string, gstinLabel: string): string[] {
  const lines = [
    address.name,
    address.line1,
    address.line2,
    `${address.city} ${address.postalCode}`.trim(),
    address.state,
    address.phone ? `Contact: ${address.phone}` : "",
    email ? `Email: ${email}` : "",
    address.gstin && gstinLabel ? `${gstinLabel}: ${address.gstin}` : "",
  ];
  return lines.filter(Boolean) as string[];
}

function paymentMethod(order: Order): string {
  if (isCod(order)) return "Cash on delivery";
  return `Online - ${paymentStateLabel(order).label}`;
}

function paymentStanding(order: Order): string {
  if (order.refundedAmount > 0) return `Refunded: ${rupees(order.refundedAmount)}`;
  if (isCod(order)) {
    return order.status === "delivered"
      ? "Paid in cash on delivery"
      : `Payable on delivery: ${rupees(order.total)}`;
  }
  return order.paymentStatus === "paid" ? "Paid online" : `Payable: ${rupees(order.total)}`;
}

/** "9%" — a tax line's rate, worked back from the amount it came to. */
function percent(tax: number, base: number): string {
  if (base <= 0) return "";
  const rate = (tax / base) * 100;
  return `${Number(rate.toFixed(2))}%`;
}

/** A single-line cell that must not spill into the next one. */
function fit(pdf: Pdf, value: string, width: number, size: number): string {
  if (pdf.widthOf(value, size) <= width) return value;
  let cut = value;
  while (cut.length > 1 && pdf.widthOf(`${cut}...`, size) > width) cut = cut.slice(0, -1);
  return `${cut}...`;
}

function wrap(pdf: Pdf, value: string, width: number, size: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (pdf.widthOf(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [value];
}

/** "25/09/2026", in Indian time wherever the server is. */
function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

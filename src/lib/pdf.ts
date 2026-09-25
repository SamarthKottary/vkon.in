import { deflateSync } from "node:zlib";
import type { Raster } from "@/lib/png";

/**
 * A small PDF writer — enough for an invoice, and nothing else.
 *
 * **Written rather than installed.** Runtime dependencies are limited to
 * next, react and react-dom (AGENTS.md), and a PDF library is megabytes of
 * font machinery for a document that is text, rules, boxes and one logo. What
 * is here is the 1.4 file structure, the two standard Helvetica faces (which
 * every reader has, so nothing is embedded), and Flate-compressed images.
 *
 * **Coordinates are top-left**, like everything else in this codebase and
 * unlike PDF itself; `at()` does the flip. Sizes are points: A4 is 595.28 ×
 * 841.89, and the invoice's margins are set in `lib/invoice.ts`.
 *
 * **There is no `₹`.** The standard fonts are WinAnsi-encoded and the rupee
 * sign is not in that set; drawing it would mean embedding and subsetting a
 * TrueType font. Amounts are written "Rs. 1,639.00" instead, which is what
 * a rupee invoice did before the sign existed and is unambiguous. Any
 * character outside WinAnsi is dropped rather than drawn as a wrong glyph.
 */

export const A4 = { width: 595.28, height: 841.89 };

type TextOptions = {
  size?: number;
  bold?: boolean;
  /** 0–1 grey, or an [r, g, b] each 0–1. */
  colour?: number | [number, number, number];
  align?: "left" | "right" | "centre";
};

type BoxOptions = {
  fill?: number | [number, number, number];
  stroke?: number | [number, number, number];
  lineWidth?: number;
};

export class Pdf {
  private readonly pages: string[] = [];
  private current: string[] = [];
  private readonly images: { name: string; image: Raster }[] = [];
  readonly width: number;
  readonly height: number;

  constructor(size: { width: number; height: number } = A4) {
    this.width = size.width;
    this.height = size.height;
  }

  /** Finishes this page and starts another. */
  newPage(): void {
    this.pages.push(this.current.join("\n"));
    this.current = [];
  }

  get pageCount(): number {
    return this.pages.length + 1;
  }

  text(x: number, y: number, value: string, options: TextOptions = {}): void {
    const size = options.size ?? 9;
    const font = options.bold ? "F2" : "F1";
    const text = clean(value);
    if (!text) return;
    const width = this.widthOf(text, size, options.bold);
    const left =
      options.align === "right" ? x - width : options.align === "centre" ? x - width / 2 : x;

    this.current.push(
      `q ${colour(options.colour ?? 0)} BT /${font} ${size} Tf 1 0 0 1 ${left.toFixed(2)} ${this.at(y + size * 0.78).toFixed(2)} Tm (${escape(text)}) Tj ET Q`,
    );
  }

  /** Text wrapped into `width`, returning how many lines it took. */
  paragraph(
    x: number,
    y: number,
    width: number,
    value: string,
    options: TextOptions & { leading?: number } = {},
  ): number {
    const size = options.size ?? 9;
    const leading = options.leading ?? size * 1.35;
    const words = clean(value).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (this.widthOf(next, size, options.bold) > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    lines.forEach((one, index) => this.text(x, y + index * leading, one, options));
    return lines.length;
  }

  line(x1: number, y1: number, x2: number, y2: number, options: BoxOptions = {}): void {
    this.current.push(
      `q ${colour(options.stroke ?? 0.8, true)} ${(options.lineWidth ?? 0.5).toFixed(2)} w ` +
        `${x1.toFixed(2)} ${this.at(y1).toFixed(2)} m ${x2.toFixed(2)} ${this.at(y2).toFixed(2)} l S Q`,
    );
  }

  rect(x: number, y: number, width: number, height: number, options: BoxOptions = {}): void {
    const shape = `${x.toFixed(2)} ${this.at(y + height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`;
    const parts = [`q`];
    if (options.fill !== undefined) parts.push(colour(options.fill));
    if (options.stroke !== undefined) {
      parts.push(colour(options.stroke, true), `${(options.lineWidth ?? 0.5).toFixed(2)} w`);
    }
    parts.push(shape);
    parts.push(
      options.fill !== undefined && options.stroke !== undefined
        ? "B"
        : options.fill !== undefined
          ? "f"
          : "S",
    );
    parts.push("Q");
    this.current.push(parts.join(" "));
  }

  image(image: Raster, x: number, y: number, width: number, height: number): void {
    const name = `Im${this.images.length + 1}`;
    this.images.push({ name, image });
    this.current.push(
      `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${this.at(y + height).toFixed(2)} cm /${name} Do Q`,
    );
  }

  /** The width of a string at a size, in points — for right alignment. */
  widthOf(value: string, size: number, bold = false): number {
    const widths = bold ? BOLD : REGULAR;
    let total = 0;
    for (const character of clean(value)) {
      const code = character.charCodeAt(0);
      total += widths[code - 32] ?? 556;
    }
    return (total * size) / 1000;
  }

  /** The finished file. */
  end(): Buffer {
    const pages = [...this.pages, this.current.join("\n")];
    const objects: Buffer[] = [];
    const add = (body: string | Buffer) => {
      objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1"));
      return objects.length; // 1-based object number
    };

    /* Fonts and images first, so the page objects can name them. */
    const regular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const imageRefs = this.images.map(({ name, image }) => {
      const data = deflateSync(image.rgb);
      const header =
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>\nstream\n`;
      const id = add(Buffer.concat([Buffer.from(header, "latin1"), data, Buffer.from("\nendstream", "latin1")]));
      return { name, id };
    });

    const resources =
      `<< /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >>` +
      (imageRefs.length
        ? ` /XObject << ${imageRefs.map((i) => `/${i.name} ${i.id} 0 R`).join(" ")} >>`
        : "") +
      " >>";

    /* The page tree needs its children's ids, and each page needs the tree's:
       the tree is written last and its id is known in advance. */
    const treeId = objects.length + pages.length * 2 + 1;
    const pageIds: number[] = [];
    for (const content of pages) {
      const stream = Buffer.from(content, "latin1");
      const contentId = add(
        Buffer.concat([
          Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "latin1"),
          stream,
          Buffer.from("\nendstream", "latin1"),
        ]),
      );
      pageIds.push(
        add(
          `<< /Type /Page /Parent ${treeId} 0 R /MediaBox [0 0 ${this.width.toFixed(2)} ${this.height.toFixed(2)}] ` +
            `/Resources ${resources} /Contents ${contentId} 0 R >>`,
        ),
      );
    }
    add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    const catalogue = add(`<< /Type /Catalog /Pages ${treeId} 0 R >>`);

    /* File: header, every object, the cross-reference table, the trailer. */
    const parts: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    const offsets: number[] = [];
    let at = parts[0].length;
    objects.forEach((body, index) => {
      const object = Buffer.concat([
        Buffer.from(`${index + 1} 0 obj\n`, "latin1"),
        body,
        Buffer.from("\nendobj\n", "latin1"),
      ]);
      offsets.push(at);
      at += object.length;
      parts.push(object);
    });

    const xref = [`xref`, `0 ${objects.length + 1}`, `0000000000 65535 f `];
    for (const offset of offsets) xref.push(`${String(offset).padStart(10, "0")} 00000 n `);
    parts.push(
      Buffer.from(
        `${xref.join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root ${catalogue} 0 R >>\nstartxref\n${at}\n%%EOF\n`,
        "latin1",
      ),
    );
    return Buffer.concat(parts);
  }

  /** Top-left y to PDF's bottom-left y. */
  private at(y: number): number {
    return this.height - y;
  }
}

/** Amounts as an invoice prints them: `Rs. 1,639.00`, from paise. */
export function rupees(paise: number): string {
  const value = (paise / 100).toFixed(2);
  const [whole, fraction] = value.split(".");
  /* Indian grouping: the last three digits, then pairs. */
  const last = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last}` : last;
  return `Rs. ${grouped}.${fraction}`;
}

/** WinAnsi only, and no control characters: anything else is dropped. */
function clean(value: string): string {
  return value
    .replace(/₹/g, "Rs.")
    .replace(/[–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, "-")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code <= 255;
    })
    .join("");
}

function escape(value: string): string {
  return value.replace(/[\\()]/g, (character) => `\\${character}`);
}

function colour(value: number | [number, number, number], stroke = false): string {
  const [r, g, b] = typeof value === "number" ? [value, value, value] : value;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} ${stroke ? "RG" : "rg"}`;
}

/* Helvetica and Helvetica-Bold advance widths, in 1/1000 em, for ASCII 32-126
   — the standard AFM numbers. Everything drawn here is ASCII by the time
   `clean` has run, and anything outside the table is treated as 556. */
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

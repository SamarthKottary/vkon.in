/**
 * A Code 128 reader, written here rather than installed (client, 2026-09-24:
 * "make it work on all browser even my laptop camera as well").
 *
 * **Why not a library.** Runtime dependencies are limited to next, react and
 * react-dom (AGENTS.md), and the browser's own `BarcodeDetector` — which the
 * Scan dialog still prefers when it exists — turned out to be missing on the
 * two devices this is actually used from: Chrome on a Linux laptop and the
 * phone's browser. A scanning library is 100–500 KB of WASM for one symbology
 * we control both ends of: Shiprocket prints **Code 128** for the AWB and for
 * the order number, and nothing else on the label needs reading.
 *
 * **What it does.** Takes the pixels of a frame, reads horizontal lines across
 * it, turns each line into bar/space run lengths, and matches those against
 * the Code 128 alphabet — the same shape as ZXing's row reader, and the same
 * two tolerances. A decode is only accepted when the symbol's own **checksum**
 * agrees, so a misread is thrown away rather than looked up: the cost of a
 * wrong answer here is the operator opening somebody else's order.
 *
 * No DOM types: it takes the plain `{data, width, height}` that both
 * `CanvasRenderingContext2D.getImageData` and a test can produce, so it can be
 * exercised without a browser.
 */

/**
 * The Code 128 alphabet: six run lengths (bar, space, bar, space, bar, space)
 * per symbol, in modules, summing to 11. The last entry is the stop pattern,
 * which has a seventh run and sums to 13.
 */
const PATTERNS: readonly (readonly number[])[] = [
  [2, 1, 2, 2, 2, 2], [2, 2, 2, 1, 2, 2], [2, 2, 2, 2, 2, 1], [1, 2, 1, 2, 2, 3],
  [1, 2, 1, 3, 2, 2], [1, 3, 1, 2, 2, 2], [1, 2, 2, 2, 1, 3], [1, 2, 2, 3, 1, 2],
  [1, 3, 2, 2, 1, 2], [2, 2, 1, 2, 1, 3], [2, 2, 1, 3, 1, 2], [2, 3, 1, 2, 1, 2],
  [1, 1, 2, 2, 3, 2], [1, 2, 2, 1, 3, 2], [1, 2, 2, 2, 3, 1], [1, 1, 3, 2, 2, 2],
  [1, 2, 3, 1, 2, 2], [1, 2, 3, 2, 2, 1], [2, 2, 3, 2, 1, 1], [2, 2, 1, 1, 3, 2],
  [2, 2, 1, 2, 3, 1], [2, 1, 3, 2, 1, 2], [2, 2, 3, 1, 1, 2], [3, 1, 2, 1, 3, 1],
  [3, 1, 1, 2, 2, 2], [3, 2, 1, 1, 2, 2], [3, 2, 1, 2, 2, 1], [3, 1, 2, 2, 1, 2],
  [3, 2, 2, 1, 1, 2], [3, 2, 2, 2, 1, 1], [2, 1, 2, 1, 2, 3], [2, 1, 2, 3, 2, 1],
  [2, 3, 2, 1, 2, 1], [1, 1, 1, 3, 2, 3], [1, 3, 1, 1, 2, 3], [1, 3, 1, 3, 2, 1],
  [1, 1, 2, 3, 1, 3], [1, 3, 2, 1, 1, 3], [1, 3, 2, 3, 1, 1], [2, 1, 1, 3, 1, 3],
  [2, 3, 1, 1, 1, 3], [2, 3, 1, 3, 1, 1], [1, 1, 2, 1, 3, 3], [1, 1, 2, 3, 3, 1],
  [1, 3, 2, 1, 3, 1], [1, 1, 3, 1, 2, 3], [1, 1, 3, 3, 2, 1], [1, 3, 3, 1, 2, 1],
  [3, 1, 3, 1, 2, 1], [2, 1, 1, 3, 3, 1], [2, 3, 1, 1, 3, 1], [2, 1, 3, 1, 1, 3],
  [2, 1, 3, 3, 1, 1], [2, 1, 3, 1, 3, 1], [3, 1, 1, 1, 2, 3], [3, 1, 1, 3, 2, 1],
  [3, 3, 1, 1, 2, 1], [3, 1, 2, 1, 1, 3], [3, 1, 2, 3, 1, 1], [3, 3, 2, 1, 1, 1],
  [3, 1, 4, 1, 1, 1], [2, 2, 1, 4, 1, 1], [4, 3, 1, 1, 1, 1], [1, 1, 1, 2, 2, 4],
  [1, 1, 1, 4, 2, 2], [1, 2, 1, 1, 2, 4], [1, 2, 1, 4, 2, 1], [1, 4, 1, 1, 2, 2],
  [1, 4, 1, 2, 2, 1], [1, 1, 2, 2, 1, 4], [1, 1, 2, 4, 1, 2], [1, 2, 2, 1, 1, 4],
  [1, 2, 2, 4, 1, 1], [1, 4, 2, 1, 1, 2], [1, 4, 2, 2, 1, 1], [2, 4, 1, 2, 1, 1],
  [2, 2, 1, 1, 1, 4], [4, 1, 3, 1, 1, 1], [2, 4, 1, 1, 1, 2], [1, 3, 4, 1, 1, 1],
  [1, 1, 1, 2, 4, 2], [1, 2, 1, 1, 4, 2], [1, 2, 1, 2, 4, 1], [1, 1, 4, 2, 1, 2],
  [1, 2, 4, 1, 1, 2], [1, 2, 4, 2, 1, 1], [4, 1, 1, 2, 1, 2], [4, 2, 1, 1, 1, 2],
  [4, 2, 1, 2, 1, 1], [2, 1, 2, 1, 4, 1], [2, 1, 4, 1, 2, 1], [4, 1, 2, 1, 2, 1],
  [1, 1, 1, 1, 4, 3], [1, 1, 1, 3, 4, 1], [1, 3, 1, 1, 4, 1], [1, 1, 4, 1, 1, 3],
  [1, 1, 4, 3, 1, 1], [4, 1, 1, 1, 1, 3], [4, 1, 1, 3, 1, 1], [1, 1, 3, 1, 4, 1],
  [1, 1, 4, 1, 3, 1], [3, 1, 1, 1, 4, 1], [4, 1, 1, 1, 3, 1], [2, 1, 1, 4, 1, 2],
  [2, 1, 1, 2, 1, 4], [2, 1, 1, 2, 3, 2], [2, 3, 3, 1, 1, 1, 2],
];

const START_A = 103;
const START_B = 104;
const START_C = 105;
const STOP = 106;

/* ZXing's two tolerances, which this reader is a reimplementation of: how far
   one run may be from its pattern, and how far the symbol may be on average,
   both as a fraction of the module width. Loose enough for a phone held at an
   angle, tight enough that the checksum is not doing all the work. */
const MAX_INDIVIDUAL_VARIANCE = 0.7;
const MAX_AVG_VARIANCE = 0.25;

export type Frame = { data: Uint8ClampedArray | number[]; width: number; height: number };

/**
 * How closely a run of six (or seven) lengths matches a pattern, or
 * `Infinity` when it does not. Lower is better.
 */
function variance(counts: number[], pattern: readonly number[]): number {
  let total = 0;
  let patternTotal = 0;
  for (let i = 0; i < pattern.length; i++) {
    total += counts[i];
    patternTotal += pattern[i];
  }
  if (total < patternTotal) return Infinity; // too small to be this symbol

  const unit = total / patternTotal;
  const maxIndividual = unit * MAX_INDIVIDUAL_VARIANCE;
  let totalVariance = 0;
  for (let i = 0; i < pattern.length; i++) {
    const diff = Math.abs(counts[i] - pattern[i] * unit);
    if (diff > maxIndividual) return Infinity;
    totalVariance += diff;
  }
  return totalVariance / total;
}

/** The symbol these runs are, or -1. */
function decodeSymbol(counts: number[]): number {
  let best = Infinity;
  let bestCode = -1;
  for (let code = 0; code < PATTERNS.length; code++) {
    const pattern = PATTERNS[code];
    /* The stop pattern is seven runs; everything else is six. */
    if (pattern.length !== counts.length) continue;
    const v = variance(counts, pattern);
    if (v < best) {
      best = v;
      bestCode = code;
    }
  }
  return best < MAX_AVG_VARIANCE ? bestCode : -1;
}

/**
 * One row of pixels as alternating run lengths, starting with a white run.
 *
 * The threshold is the midpoint of that row's own light and dark, so a frame
 * that is bright at one edge and dim at the other still reads — a laptop
 * webcam pointed at a label under a lamp is exactly that.
 */
function runsFromRow(row: Uint8Array): number[] | null {
  let min = 255;
  let max = 0;
  for (const value of row) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  /* No contrast: a wall, a hand, an out-of-focus blur. */
  if (max - min < 40) return null;
  const threshold = (min + max) / 2;

  const runs: number[] = [];
  let dark = false; // runs[0] is the white run before the first bar
  let length = 0;
  for (const value of row) {
    const isDark = value < threshold;
    if (isDark === dark) {
      length++;
    } else {
      runs.push(length);
      length = 1;
      dark = isDark;
    }
  }
  runs.push(length);
  return runs;
}

/** Where a start symbol begins in `runs`, with which start code. */
function findStart(runs: number[], from: number): { index: number; code: number } | null {
  /* Even indices are white runs, odd are bars — `runs[0]` is the leading
     white. A symbol starts on a bar. */
  for (let i = from | 1; i + 6 < runs.length; i += 2) {
    const counts = runs.slice(i, i + 6);
    let width = 0;
    for (const c of counts) width += c;
    /* Under ~1.5 pixels a module the run lengths are rounding noise. A phone
       frame is far above this; a 300px screenshot of a label is not. */
    if (width < 16) continue;

    for (const code of [START_A, START_B, START_C]) {
      if (variance(counts, PATTERNS[code]) < MAX_AVG_VARIANCE) {
        /* A quiet zone before it, as the symbology requires — half the
           symbol's own width, which is what keeps a busy label from
           decoding its own address block as a start pattern. */
        const quiet = runs[i - 1] ?? Infinity;
        if (quiet >= width * 0.4) return { index: i, code };
      }
    }
  }
  return null;
}

/** The codes of one symbol run, from a start pattern to the stop pattern. */
function decodeCodes(runs: number[], start: { index: number; code: number }): number[] | null {
  const codes = [start.code];
  let i = start.index + 6;

  while (i + 6 <= runs.length) {
    /* The stop pattern is seven runs, so it is tried first: its first six
       would otherwise match something else. */
    if (i + 7 <= runs.length && decodeSymbol(runs.slice(i, i + 7)) === STOP) {
      codes.push(STOP);
      return codes;
    }
    const code = decodeSymbol(runs.slice(i, i + 6));
    if (code < 0) return null;
    codes.push(code);
    if (codes.length > 80) return null; // a label is never this long
    i += 6;
  }
  return null;
}

/** The symbol's own checksum, which is what makes a misread safe. */
function checksumOk(codes: number[]): boolean {
  /* [start, ...data, checksum, stop] */
  if (codes.length < 4) return false;
  const check = codes[codes.length - 2];
  let sum = codes[0];
  for (let i = 1; i < codes.length - 2; i++) sum += i * codes[i];
  return sum % 103 === check;
}

/** The codes as the text they stand for, across the three code sets. */
function toText(codes: number[]): string | null {
  let set: "A" | "B" | "C" = codes[0] === START_A ? "A" : codes[0] === START_B ? "B" : "C";
  let shifted: "A" | "B" | null = null;
  let out = "";

  for (let i = 1; i < codes.length - 2; i++) {
    const code = codes[i];
    const active: "A" | "B" | "C" = shifted ?? set;
    shifted = null;

    if (active === "C") {
      if (code < 100) {
        out += String(code).padStart(2, "0");
      } else if (code === 100) {
        set = "B";
      } else if (code === 101) {
        set = "A";
      } else if (code !== 102) {
        return null;
      }
      continue;
    }

    if (code < 96) {
      /* A holds the control characters where B holds the lower case; neither
         appears on a label, but the mapping is what makes it Code 128. */
      if (active === "A") {
        out += String.fromCharCode(code < 64 ? code + 32 : code - 64);
      } else {
        out += String.fromCharCode(code + 32);
      }
      continue;
    }

    /* The switches, which differ between the sets: from A, 100 is code B and
       101 is code C; from B, 100 is code A and 99 is code C. Everything else
       up here is an FNC, which carries no text. */
    if (code === 98) {
      shifted = active === "A" ? "B" : "A"; // SHIFT, one character only
    } else if (code === 100) {
      set = active === "A" ? "B" : "A";
    } else if ((active === "A" && code === 101) || (active === "B" && code === 99)) {
      set = "C";
    } else if (code > 102) {
      return null;
    }
  }

  return out;
}

/** One row of luminance, decoded in the direction given. */
function readRow(row: Uint8Array): string | null {
  const runs = runsFromRow(row);
  if (!runs || runs.length < 14) return null;

  for (const order of [runs, [...runs].reverse()]) {
    /* Reversed, the leading white run may land on an odd index; the start
       search walks bars either way. */
    let from = 1;
    for (let attempt = 0; attempt < 4; attempt++) {
      const start = findStart(order, from);
      if (!start) break;
      const codes = decodeCodes(order, start);
      if (codes && checksumOk(codes)) {
        const text = toText(codes);
        if (text) return text;
      }
      from = start.index + 2; // a false start: look past it
    }
  }
  return null;
}

/**
 * The barcode in a frame, or null.
 *
 * Reads `lines` evenly spaced rows rather than the whole image: a barcode is
 * the same across its height, so one line through it is enough, and twenty of
 * them means the label does not have to be centred. Rows are read from the
 * middle outwards, because that is where somebody points a camera.
 */
export function readBarcode(frame: Frame, lines = 24): string | null {
  const { data, width, height } = frame;
  if (width < 40 || height < 2) return null;

  const row = new Uint8Array(width);
  const order: number[] = [];
  for (let i = 0; i < lines; i++) {
    /* 0.5, then 0.5 ± 1/lines, ± 2/lines … out to the edges. */
    const offset = Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1);
    const y = Math.round(height / 2 + (offset * height) / (lines + 1));
    if (y > 0 && y < height - 1) order.push(y);
  }

  for (const y of order) {
    const start = y * width * 4;
    for (let x = 0; x < width; x++) {
      const p = start + x * 4;
      /* Rec. 601 luma, integer: the green channel carries most of it. */
      row[x] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
    }
    const found = readRow(row);
    if (found) return found;
  }
  return null;
}

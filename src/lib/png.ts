import { inflateSync } from "node:zlib";

/**
 * Just enough PNG to put the logo on an invoice.
 *
 * The invoice is drawn by `lib/pdf.ts`, which needs raw samples: a PDF image
 * is a stream of pixels plus a colour space, not a file format it understands.
 * Node has `zlib`, which is the only hard part of PNG — the rest is undoing
 * the five scanline filters — so this is a few dozen lines instead of an image
 * library (runtime dependencies stay at next/react/react-dom, AGENTS.md).
 *
 * **8-bit, non-interlaced, greyscale or truecolour, with or without alpha** —
 * which is what `public/brand/*.png` are and what any export from a design
 * tool will be. Anything else throws rather than drawing something wrong;
 * the caller falls back to setting the header in type.
 *
 * Alpha is flattened onto white, because that is the paper.
 */

export type Raster = { width: number; height: number; rgb: Buffer };

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Bytes per pixel for the colour types this reads. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function decodePng(file: Buffer): Raster {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error("Not a PNG.");

  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];

  for (let at = 8; at + 8 <= file.length; ) {
    const length = file.readUInt32BE(at);
    const type = file.toString("ascii", at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);
    at += 12 + length; // length + type + data + CRC

    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colour = body[9];
      const interlace = body[12];
      if (depth !== 8) throw new Error(`PNG bit depth ${depth} is not supported.`);
      if (interlace !== 0) throw new Error("Interlaced PNG is not supported.");
      channels = CHANNELS[colour] ?? 0;
      if (!channels) throw new Error(`PNG colour type ${colour} is not supported.`);
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height || !channels) throw new Error("PNG header missing.");

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const flat = Buffer.alloc(height * stride);

  /* Each row carries its filter in a leading byte, and every filter refers to
     the pixel to the left (`a`) and the row above (`b`) — which is why this
     runs in place over the output rather than row by row in isolation. */
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = flat.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? flat.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const value = line[x];
      const a = x >= channels ? out[x - channels] : 0;
      const b = above ? above[x] : 0;
      const c = above && x >= channels ? above[x - channels] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        /* Paeth: whichever of left, above and above-left the gradient is
           nearest to. */
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`PNG filter ${filter} is not a filter.`);
      }
      out[x] = (value + add) & 0xff;
    }
  }

  /* To RGB over white: paper has no alpha channel. */
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, p = 0; i < width * height; i++) {
    const s = i * channels;
    const grey = channels <= 2;
    const r = grey ? flat[s] : flat[s];
    const g = grey ? flat[s] : flat[s + 1];
    const b = grey ? flat[s] : flat[s + 2];
    const alpha = channels === 4 ? flat[s + 3] : channels === 2 ? flat[s + 1] : 255;
    rgb[p++] = blend(r, alpha);
    rgb[p++] = blend(g, alpha);
    rgb[p++] = blend(b, alpha);
  }

  return { width, height, rgb };
}

function blend(value: number, alpha: number): number {
  return alpha === 255 ? value : Math.round((value * alpha + 255 * (255 - alpha)) / 255);
}

/** The same raster, cropped — the logo out of a banner, for instance. */
export function crop(image: Raster, x: number, y: number, width: number, height: number): Raster {
  const rgb = Buffer.alloc(width * height * 3);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * image.width + x) * 3;
    image.rgb.copy(rgb, row * width * 3, from, from + width * 3);
  }
  return { width, height, rgb };
}

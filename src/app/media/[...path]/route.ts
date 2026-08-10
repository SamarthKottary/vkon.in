import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { uploadDir } from "@/lib/storage";

/**
 * Serves admin-uploaded images from the upload volume.
 *
 * They cannot live in `public/`: that directory is baked into the image at
 * build time, so anything uploaded afterwards would vanish on the next deploy.
 * Serving them through a route means the files live on a volume and survive.
 *
 * Filenames are content-hash based and immutable, so the response is cached
 * hard — `next/image` fetches each source once and caches its optimised output
 * on top.
 */

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  // Single flat segment only. Rejecting anything else removes every traversal
  // trick (`..`, encoded separators, absolute paths) rather than filtering them.
  if (!segments || segments.length !== 1) {
    return new Response("Not found", { status: 404 });
  }

  const name = segments[0];
  if (name !== path.basename(name) || name.startsWith(".")) {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(name).toLowerCase();
  const contentType = TYPES[ext];
  if (!contentType) return new Response("Not found", { status: 404 });

  const file = path.join(uploadDir(), name);

  // Belt and braces: confirm the resolved path is still inside the directory.
  if (!file.startsWith(uploadDir() + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) return new Response("Not found", { status: 404 });

    const stream = Readable.toWeb(
      createReadStream(file),
    ) as WebReadableStream<Uint8Array>;

    return new Response(stream as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

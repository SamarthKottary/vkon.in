import { createHash, randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Product image storage, backed by a directory on disk.
 *
 * This replaced Vercel Blob when the site moved to self-hosting: Blob is a
 * Vercel-only service and simply does not exist on your own server. Files live
 * in UPLOAD_DIR, which is a Docker volume in production, so uploads survive
 * every rebuild and redeploy — the container is disposable, the volume is not.
 *
 * `pathname` on a stored image is the bare filename, and it is what
 * `deleteProductImages` removes. The public URL is `/media/<filename>`, served
 * by the route handler in `app/media/[...path]/route.ts`.
 */

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

/** Absolute path to the upload directory. */
export function uploadDir(): string {
  return process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(process.cwd(), "data/uploads");
}

export type UploadResult =
  | { ok: true; url: string; pathname: string }
  | { ok: false; error: string };

export function isStorageConfigured(): boolean {
  // Disk storage always works; the directory is created on demand.
  return true;
}

export async function uploadProductImage(file: File): Promise<UploadResult> {
  if (!file || file.size === 0) return { ok: false, error: "No file received." };

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB — please resize it.`,
    };
  }

  const ext = ALLOWED.get(file.type);
  if (!ext) return { ok: false, error: "Images must be JPEG, PNG, WebP or AVIF." };

  // Name from the content hash plus randomness: identical re-uploads do not
  // collide with each other, and nothing user-supplied reaches the filesystem.
  const bytes = Buffer.from(await file.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const filename = `${digest}-${randomBytes(4).toString("hex")}.${ext}`;

  try {
    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), bytes, { mode: 0o644 });
    return { ok: true, url: `/media/${filename}`, pathname: filename };
  } catch (error) {
    console.error("[storage] upload failed:", error);
    return { ok: false, error: "Could not save the image. Check disk space and permissions." };
  }
}

/** Best-effort cleanup — a failure here must not block deleting a product. */
export async function deleteProductImages(pathnames: string[]): Promise<void> {
  const dir = uploadDir();
  for (const name of pathnames) {
    // Never let a stored value escape the upload directory.
    const base = path.basename(name);
    if (!base || base !== name) continue;
    try {
      await unlink(path.join(dir, base));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") console.error("[storage] delete failed:", error);
    }
  }
}

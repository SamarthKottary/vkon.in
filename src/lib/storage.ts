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

// ---------------------------------------------------------------------------
// Profile pictures (2026-09-19)
// ---------------------------------------------------------------------------

/** Far above what the browser sends (a 256px square, ~20 KB), and far below
 *  anything that could hurt: the file is written once and served often. */
const AVATAR_MAX_BYTES = 1024 * 1024;

/**
 * What an image really is, from its first bytes — never from the name or the
 * declared type, which the sender controls. Only formats every browser shows.
 */
export function imageKind(bytes: Buffer): "jpg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

/**
 * Stores a profile picture in the upload volume as `avatar-<random>.<ext>`,
 * served by `/media` like the product images. A random name, never anything
 * the customer sent, and a new one per upload — `/media` caches forever, so a
 * changed picture must have a changed URL.
 */
export async function saveAvatar(
  bytes: Buffer,
): Promise<{ ok: true; filename: string } | { ok: false; error: string }> {
  if (bytes.length === 0) return { ok: false, error: "No image received." };
  if (bytes.length > AVATAR_MAX_BYTES) return { ok: false, error: "That image is too large." };
  const ext = imageKind(bytes);
  if (!ext) return { ok: false, error: "Please choose a JPEG, PNG or WebP image." };
  const filename = `avatar-${randomBytes(12).toString("hex")}.${ext}`;
  try {
    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), bytes, { mode: 0o644 });
    return { ok: true, filename };
  } catch (error) {
    console.error("[storage] avatar save failed:", error);
    return { ok: false, error: "Could not save the picture just now. Please try again." };
  }
}

/** Best effort: an orphaned file costs a few KB; a thrown error would cost the
 *  customer their save. Only ever an `avatar-…` name in the upload directory. */
export async function deleteAvatar(filename: string | null): Promise<void> {
  if (!filename) return;
  const base = path.basename(filename);
  if (base !== filename || !base.startsWith("avatar-")) return;
  try {
    await unlink(path.join(uploadDir(), base));
  } catch {
    /* Already gone. */
  }
}

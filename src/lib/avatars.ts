import { setCustomerAvatar } from "@/lib/db/customers";
import { deleteAvatar, saveAvatar } from "@/lib/storage";
import type { Customer } from "@/lib/types";

/**
 * Copies a Google account's profile photo onto the customer, at Google
 * sign-in (client, 2026-09-19: "if user has signed in using google could we
 * pull their google profile pic").
 *
 * **Copied, not linked.** The file is fetched once and stored in the upload
 * volume like any other picture, so every page serves it from `/media` —
 * visitors' browsers never contact Google for it, and a signed-in page does
 * not depend on Google's image servers being up.
 *
 * Only when it is theirs to set: never over a picture the customer uploaded,
 * and never after they removed one. Fetched again only when Google's URL has
 * changed, so an ordinary sign-in costs nothing.
 *
 * **Never throws, and gives up after four seconds** — a slow image must not
 * hold up signing in.
 */
export async function refreshGoogleAvatar(customer: Customer, pictureUrl: string | null): Promise<void> {
  if (!pictureUrl) return;
  if (customer.avatarSource === "upload" || customer.avatarSource === "removed") return;
  if (customer.googlePicture === pictureUrl && customer.avatarUrl) return;

  try {
    /* Google serves a 96px square by default (`=s96-c`); ask for 256, the
       size an uploaded picture is stored at. */
    const sized = /=s\d+(-c)?$/.test(pictureUrl) ? pictureUrl.replace(/=s\d+(-c)?$/, "=s256-c") : pictureUrl;
    const response = await fetch(sized, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return;
    const bytes = Buffer.from(await response.arrayBuffer());

    const saved = await saveAvatar(bytes);
    if (!saved.ok) {
      console.error("[avatars] google picture not saved:", saved.error);
      return;
    }
    const previous = await setCustomerAvatar(customer.id, {
      avatar: saved.filename,
      source: "google",
      googlePicture: pictureUrl,
    });
    await deleteAvatar(previous);
  } catch (error) {
    console.error("[avatars] google picture fetch failed:", error);
  }
}

/**
 * Turns a YouTube or Vimeo URL into an embed.
 *
 * The admin pastes whatever URL the share button gives them — watch links,
 * youtu.be short links, /shorts/, /embed/, vimeo.com/ID — and this normalises
 * all of them. Anything unrecognised returns null and the product page simply
 * omits the video rather than rendering a broken iframe.
 */

export type VideoEmbed = {
  provider: "youtube" | "vimeo";
  id: string;
  /** Privacy-preserving embed URL. */
  embedUrl: string;
  /** Poster image, so nothing loads from the provider until the visitor clicks. */
  thumbnailUrl: string | null;
};

export function parseVideoUrl(input: string | null | undefined): VideoEmbed | null {
  if (!input) return null;

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  // YouTube
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id ? youtube(id) : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const watchId = url.searchParams.get("v");
    if (watchId) return youtube(watchId);

    const segments = url.pathname.split("/").filter(Boolean);
    // /embed/ID, /shorts/ID, /live/ID, /v/ID
    if (
      segments.length >= 2 &&
      ["embed", "shorts", "live", "v"].includes(segments[0])
    ) {
      return youtube(segments[1]);
    }
    return null;
  }

  // Vimeo
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const segments = url.pathname.split("/").filter(Boolean);
    const id = segments.find((s) => /^\d+$/.test(s));
    return id ? vimeo(id) : null;
  }

  return null;
}

function youtube(rawId: string): VideoEmbed | null {
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id) return null;
  return {
    provider: "youtube",
    id,
    // -nocookie avoids setting tracking cookies before the visitor opts in.
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
  };
}

function vimeo(rawId: string): VideoEmbed | null {
  const id = rawId.replace(/[^0-9]/g, "");
  if (!id) return null;
  return {
    provider: "vimeo",
    id,
    embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1`,
    // Vimeo thumbnails need an API call; the player poster is used instead.
    thumbnailUrl: null,
  };
}

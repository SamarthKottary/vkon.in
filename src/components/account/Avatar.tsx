import Image from "next/image";

/**
 * A customer's profile picture, or their initial when there is none (client,
 * 2026-09-19: "could we have the customer/users profile pic, instead of just
 * saying letter").
 *
 * The picture is a same-origin `/media` file — uploaded on /account, or copied
 * from Google at sign-in (`lib/avatars.ts`) — so `next/image` can size it with
 * no remote-host configuration. Decorative (`alt=""`): the name is always
 * beside it.
 *
 * No hooks, so it renders on the server and inside client components alike.
 */
export function Avatar({
  name,
  email,
  url,
  size,
}: {
  name: string;
  email: string;
  url: string | null;
  /** Pixels, square. */
  size: number;
}) {
  const box = { width: size, height: size };
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        style={box}
        className="shrink-0 rounded-full bg-surface-subtle object-cover"
      />
    );
  }
  const initial = (name.trim() || email)[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden
      style={{ ...box, fontSize: Math.round(size * 0.42) }}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-surface"
    >
      {initial}
    </span>
  );
}

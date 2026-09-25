"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  MailIcon,
  ShareIcon,
  TelegramIcon,
  WhatsAppIcon,
  XIcon,
} from "@/components/icons/ui";

/**
 * **Share** on a product page (client, 2026-09-25).
 *
 * A menu rather than only the system sheet (client, same day: "also include
 * whatsapp, where it opens in another new tab"): WhatsApp is how a dealer
 * sends a product to a customer here, and on a laptop — where
 * `navigator.share` mostly does not exist — the sheet was never going to
 * appear anyway.
 *
 *  - **WhatsApp, Facebook, X, LinkedIn, Telegram and Email** are ordinary
 *    links with `target="_blank"`, so they open beside the page rather than
 *    taking somebody off it mid-decision. Each is that service's own share
 *    endpoint — `wa.me`, `facebook.com/sharer`, `x.com/intent/post`,
 *    `linkedin.com/sharing/share-offsite`, `t.me/share` — which open the app
 *    on a phone and the web version on a laptop, with the link prefilled.
 *  - **Instagram has no share URL at all**: nothing on the web can compose an
 *    Instagram post or story on somebody's behalf, and a link to
 *    instagram.com would just be a link to Instagram. So it copies the link
 *    and says to paste it there — which is what a person does anyway — rather
 *    than pretending to do more.
 *  - **Copy link** puts the URL on the clipboard and says so for two seconds.
 *  - **Share…** appears only where the device has a share sheet, and calls it
 *    straight out of the click — awaiting anything first loses the user
 *    gesture and the sheet never opens. A cancelled share (`AbortError`) is
 *    somebody changing their mind, not an error.
 *
 * The URL is absolute, built from `window.location.origin`, because a link
 * beginning `/products/…` is useless in a WhatsApp message.
 */
export function ShareProduct({ name, path }: { name: string; path: string }) {
  /* The open menu carries what only the browser knows: the absolute URL, and
     whether this device has a share sheet. Both are read in the click that
     opens it — never in an effect, which is §9's rule and this project's
     `set-state-in-effect` lint rule — and a link built during rendering would
     carry whatever host the server thinks it is on. */
  const [menu, setMenu] = useState<{ url: string; canShare: boolean; up: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  /* Instagram's line, which has to explain itself. */
  const [hint, setHint] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = menu !== null;
  const setOpen = (value: boolean) =>
    setMenu(
      value
        ? {
            url: new URL(path, window.location.origin).toString(),
            canShare: Boolean(navigator.share),
            up: !roomBelow(wrapRef.current),
          }
        : null,
    );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const url = menu?.url ?? path;
  const message = `${name} - ${url}`;
  const link = encodeURIComponent(url);
  const text = encodeURIComponent(name);

  const links: { label: string; href: string; icon: (p: { className?: string }) => React.ReactElement }[] =
    [
      { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(message)}`, icon: WhatsAppIcon },
      { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${link}`, icon: FacebookIcon },
      { label: "X", href: `https://x.com/intent/post?url=${link}&text=${text}`, icon: XIcon },
      {
        label: "LinkedIn",
        href: `https://www.linkedin.com/sharing/share-offsite/?url=${link}`,
        icon: LinkedInIcon,
      },
      { label: "Telegram", href: `https://t.me/share/url?url=${link}&text=${text}`, icon: TelegramIcon },
      {
        label: "Email",
        href: `mailto:?subject=${text}&body=${encodeURIComponent(message)}`,
        icon: MailIcon,
      },
    ];

  const copy = async (note?: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (note) setHint(note);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setCopied(false);
        setHint(null);
      }, 3000);
    } catch {
      window.prompt("Copy this link", url);
    }
    setMenu(null);
  };

  const sheet = async () => {
    setMenu(null);
    try {
      await navigator.share({ title: name, url });
    } catch {
      /* Cancelled, or refused — the menu's other ways are still there. */
    }
  };

  /* Each row lifts a little and its icon grows on hover (client, 2026-09-25:
     "i want pop or highlight something animation"), and the colour comes with
     it so the highlight is not motion alone. `motion-safe` because somebody
     who has asked their system for less movement should get the highlight
     without the pop — the rule §6 states for every animation on this site. */
  const item =
    "group flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-ink transition-all duration-150 hover:bg-surface-subtle hover:text-accent motion-safe:hover:-translate-y-0.5";
  const glyph =
    "h-4 w-4 shrink-0 text-muted transition-transform duration-150 group-hover:text-accent motion-safe:group-hover:scale-125";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-9 items-center gap-2 text-sm font-medium text-ink transition-colors hover:text-accent"
      >
        {copied ? <CheckIcon className="h-4 w-4 text-accent" /> : <ShareIcon className="h-4 w-4" />}
        {copied ? hint ?? "Link copied" : "Share"}
      </button>

      {menu && (
        <div
          role="menu"
          aria-label={`Share ${name}`}
          className={`absolute left-0 z-40 w-64 border border-line bg-surface-raised p-1.5 shadow-card ${
            menu.up ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {/* Two columns: nine ways in one list would be a scroll. */}
          <div className="grid grid-cols-2 gap-0.5">
            {links.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                role="menuitem"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenu(null)}
                className={item}
              >
                <Icon className={glyph} />
                {label}
              </a>
            ))}
            <button
              type="button"
              role="menuitem"
              onClick={() => copy("Link copied — paste it into Instagram")}
              className={item}
            >
              <InstagramIcon className={glyph} />
              Instagram
            </button>
            <button type="button" role="menuitem" onClick={() => copy()} className={item}>
              <ShareIcon className={glyph} />
              Copy link
            </button>
          </div>
          {menu.canShare && (
            <button
              type="button"
              role="menuitem"
              onClick={sheet}
              className={`${item} mt-0.5 border-t border-line`}
            >
              <ShareIcon className={glyph} />
              More…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The height the menu needs; it is the same six rows every time. */
const MENU_HEIGHT = 210;

/**
 * Whether the menu fits below the button — inside whatever is clipping it.
 *
 * The quick view is a panel with `overflow: hidden`, so "fits on screen" is
 * the wrong question there: the menu was cut off at the panel's edge while the
 * viewport had room to spare. This walks up to the first ancestor that clips
 * and measures against that, falling back to the window.
 */
function roomBelow(anchor: HTMLElement | null): boolean {
  if (!anchor) return true;
  const bottom = anchor.getBoundingClientRect().bottom;
  let limit = window.innerHeight;
  for (let node = anchor.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "hidden" || overflow === "auto" || overflow === "scroll") {
      limit = Math.min(limit, node.getBoundingClientRect().bottom);
      break;
    }
  }
  return limit - bottom >= MENU_HEIGHT;
}

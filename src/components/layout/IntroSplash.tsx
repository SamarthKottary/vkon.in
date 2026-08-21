"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * Brand intro shown over the page on a fresh visit: the logo flips in on a 3D
 * axis at centre, then flies up to the header and lands exactly on the real
 * logo — spinning a full turn on the way — and the cover fades as it travels,
 * so the site is revealed behind a logo that appears to take its place in the
 * header.
 *
 * **The landing is a measured hand-off.** The header logo carries
 * `data-brand-logo`; this measures its box live and transitions the splash
 * logo's `translate/scale` to match, so the flight lands pixel-accurate at any
 * breakpoint rather than guessing a corner. When the splash unmounts the
 * identical header logo is already underneath at that spot, so the swap is
 * invisible. The 3D spin needs both transforms to share one function list
 * (`translate … perspective … rotateY … scale`) — mismatched lists fall back
 * to matrix interpolation, and a 360° matrix equals identity, i.e. no spin.
 *
 * **Once per browser session.** A splash on every internal click would be
 * intolerable, and the (site) layout persists across client navigation, so
 * this mounts once per full load anyway; the `sessionStorage` flag stops it
 * replaying on a hard refresh within the same session too.
 *
 * **It covers, it does not gate.** The page renders underneath from first
 * paint — this is a `fixed`, `aria-hidden` overlay; its background fades to
 * reveal the page and the container self-clears to `visibility: hidden` /
 * `pointer-events: none` via a CSS animation, so it never traps a click even
 * if the timer below never runs. Content and crawlers see the page.
 *
 * **Reduced motion skips it** — the global rule collapses every animation and
 * transition, so the cover is gone almost immediately and the timer is
 * shortened to match rather than holding an invisible layer.
 */
export function IntroSplash() {
  const [visible, setVisible] = useState(true);
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem("vkon-intro-seen")) {
      setVisible(false);
      return;
    }
    sessionStorage.setItem("vkon-intro-seen", "1");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const t = setTimeout(() => setVisible(false), 250);
      return () => clearTimeout(t);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Once the flip-in has settled, fly the logo to the header's logo.
    timers.push(
      setTimeout(() => {
        const logo = logoRef.current;
        const target = document.querySelector<HTMLElement>("[data-brand-logo]");
        if (!logo || !target) return;

        const from = logo.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        if (from.height === 0 || to.height === 0) return;

        const scale = to.height / from.height;
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);

        // Hand off from the keyframe animation to an inline transform without a
        // jump: settle to the identity-equivalent first, reflow, then fly.
        logo.style.animation = "none";
        logo.style.transform =
          "translate(0px, 0px) perspective(900px) rotateY(0deg) scale(1)";
        void logo.offsetWidth;
        logo.style.transition = "transform 0.9s cubic-bezier(0.6, 0.02, 0.2, 1)";
        logo.style.transform = `translate(${dx}px, ${dy}px) perspective(900px) rotateY(360deg) scale(${scale})`;
      }, 1080),
    );

    timers.push(setTimeout(() => setVisible(false), 2080));
    return () => timers.forEach(clearTimeout);
  }, []);

  if (!visible) return null;

  return (
    <div aria-hidden className="intro-splash">
      <span className="intro-splash-bg" />
      <div ref={logoRef} className="intro-splash-logo">
        <Image
          src="/brand/vkon-logo-light.png"
          alt=""
          width={640}
          height={257}
          priority
          className="h-16 w-auto dark:hidden sm:h-20"
        />
        <Image
          src="/brand/vkon-logo-dark.png"
          alt=""
          width={640}
          height={262}
          priority
          className="hidden h-16 w-auto dark:block sm:h-20"
        />
      </div>
    </div>
  );
}

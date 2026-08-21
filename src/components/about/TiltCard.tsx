"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A card that tilts in 3D toward the pointer.
 *
 * The whole effect is a pair of CSS variables — `--rx`, `--ry` — written from
 * the cursor's position over the card and consumed by the `.tilt` utility in
 * globals.css. Nothing about the geometry is computed in React beyond the two
 * angles; the transform, its perspective and the ease-back live in CSS.
 *
 * **Desktop pointers only.** A tilt keyed to a cursor has nothing to track on
 * a touchscreen, and running it there would only cost work on the low-end
 * phones this site targets. `(hover: hover) and (pointer: fine)` is checked
 * once — hover capability does not change over a page's life — and the
 * listeners are never attached otherwise, so a phone renders a plain card.
 * `prefers-reduced-motion` is handled globally: that rule flattens the
 * `.tilt` transition, so the card simply does not move.
 *
 * `max` caps the rotation. Kept small (a few degrees) on purpose — this is a
 * restrained site, and a steep tilt reads as a gimmick next to the rest of it.
 */
export function TiltCard({
  children,
  className = "",
  max = 6,
}: {
  children: React.ReactNode;
  className?: string;
  /** Peak rotation in degrees at the card's edges. */
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      // Top tilts back, bottom tilts forward; left/right mirror on Y.
      el.style.setProperty("--rx", `${(0.5 - py) * max * 2}deg`);
      el.style.setProperty("--ry", `${(px - 0.5) * max * 2}deg`);
      // Glare follows the cursor as a percentage of the card box.
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
      el.dataset.active = "true";
    };

    const onLeave = () => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.dataset.active = "false";
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled, max]);

  return (
    <div ref={ref} className={`tilt ${className}`}>
      {children}
    </div>
  );
}

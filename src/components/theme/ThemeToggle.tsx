"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/icons/ui";

type Theme = "light" | "dark";

const STORAGE_KEY = "vkon-theme";
/** Lets the toggle re-render itself after it mutates the DOM attribute. */
const CHANGE_EVENT = "vkon-theme-change";

/**
 * Light/dark switch.
 *
 * The theme lives on `<html data-theme>`, set by ThemeScript before first paint
 * — so it is genuinely *external* state, not React state. `useSyncExternalStore`
 * is the primitive for exactly that: it reads the DOM as the source of truth,
 * gives a distinct server snapshot (no theme known), and avoids the
 * setState-in-an-effect pattern that a `useState` + `useEffect` version needs.
 *
 * Rendering no glyph until the client snapshot arrives is deliberate: the
 * server cannot know the visitor's preference, so committing to an icon would
 * be wrong half the time. The button keeps its size, so nothing shifts.
 */
function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  // Follow the OS only while the visitor has not made an explicit choice.
  const onMedia = () => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    document.documentElement.setAttribute(
      "data-theme",
      media.matches ? "dark" : "light",
    );
    onChange();
  };

  // Another tab toggled the theme.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    const next = event.newValue === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    onChange();
  };

  media.addEventListener("change", onMedia);
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);

  return () => {
    media.removeEventListener("change", onMedia);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** The server has no idea which theme the visitor prefers. */
function getServerSnapshot(): null {
  return null;
}

export function ThemeToggle({ tone = "default" }: { tone?: "default" | "band" }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode or storage disabled — the choice still applies to this page.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  // A bordered square, not a bare glyph. The first version was a thin grey icon
  // floating unbordered in the header and was simply not noticed as a control —
  // on a page built from 1px rules, a control has to have an edge to read as one.
  const chrome =
    tone === "band"
      ? "border-band-line text-band-muted hover:border-band-ink hover:text-band-ink"
      : "border-line text-body hover:border-ink hover:text-ink hover:bg-surface-subtle";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme ? `Switch to ${theme === "dark" ? "light" : "dark"} theme` : "Switch theme"
      }
      aria-pressed={theme ? theme === "dark" : undefined}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-sm border transition-colors ${chrome}`}
    >
      {theme === "dark" ? (
        <SunIcon className="h-[1.05rem] w-[1.05rem]" />
      ) : theme === "light" ? (
        <MoonIcon className="h-[1.05rem] w-[1.05rem]" />
      ) : null}
    </button>
  );
}

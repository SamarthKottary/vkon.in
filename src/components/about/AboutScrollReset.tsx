"use client";

import { useEffect } from "react";

/**
 * Ensures the page always starts at the top (y = 0) upon navigating to /about.
 */
export function AboutScrollReset() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  return null;
}

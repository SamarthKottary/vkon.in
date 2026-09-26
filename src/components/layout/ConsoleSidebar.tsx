"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The left column both consoles stand in: the admin's, and a store's at
 * `vkon.in/<slug>` (client, 2026-09-26: "move the stock and profile button and
 * others on top to the left side like admin panel").
 *
 * A layout primitive with nothing of either console in it — the caller passes
 * its own logo and its own links. It was `app/admin/AdminSidebar.tsx` until the
 * stores needed the same thing; two copies of a collapsible sidebar is how they
 * drift apart.
 *
 * Below `sm` it is a top bar with a toggle and the panel slides over the page;
 * from `sm` up it is a fixed column.
 */
export function ConsoleSidebar({
  logo,
  children,
}: {
  logo: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  /* Opening a link closes the panel. Compared during render rather than in an
     effect (§9): an effect renders the new page with the menu still over it
     and closes it a frame later, which reads as a flash. */
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setIsOpen(false);
  }

  return (
    <header className="sm:w-60 sm:shrink-0 sticky top-0 sm:h-screen border-b sm:border-b-0 sm:border-r border-line bg-surface flex flex-col z-30">
      <div className="flex h-14 sm:h-16 items-center justify-between px-4 sm:px-6 border-b border-line bg-surface relative z-40">
        <div className="flex items-center">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="sm:hidden p-2 -ml-2 mr-2 text-ink hover:bg-surface-subtle rounded"
            aria-label="Toggle navigation"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
              />
            </svg>
          </button>
          {logo}
        </div>
      </div>

      {isOpen && (
        <div
          className="sm:hidden fixed inset-0 top-14 bg-black/20 z-20 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        className={`${
          isOpen ? "flex" : "hidden"
        } sm:flex flex-1 flex-col absolute sm:static top-14 left-0 w-64 sm:w-auto bg-surface sm:bg-transparent h-[calc(100vh-3.5rem)] sm:h-auto border-r sm:border-none border-line overflow-y-auto sm:overflow-visible shadow-xl sm:shadow-none z-30`}
      >
        {children}
      </div>
    </header>
  );
}

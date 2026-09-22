"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

export function AdminSidebar({
  logo,
  children,
}: {
  logo: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <header className="sm:w-60 sm:shrink-0 border-b sm:border-b-0 sm:border-r border-line bg-surface flex flex-col relative z-30">
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

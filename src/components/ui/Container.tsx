import type { ReactNode } from "react";

export function Container({
  children,
  className = "",
  size = "default",
}: {
  children: ReactNode;
  className?: string;
  size?: "default" | "narrow" | "wide" | "extrawide";
}) {
  const widths = {
    narrow: "max-w-3xl",
    default: "max-w-6xl",
    wide: "max-w-7xl",
    extrawide: "max-w-[90rem]",
  };

  return (
    <div className={`mx-auto w-full px-5 sm:px-6 lg:px-8 ${widths[size]} ${className}`}>
      {children}
    </div>
  );
}

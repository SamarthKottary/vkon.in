import type { SpecRow } from "@/lib/types";

/**
 * Specification table.
 *
 * Rules between rows rather than zebra striping, labels in mono, values in the
 * sans at normal weight. This is the closest thing on the site to a printed
 * datasheet and it should look like one.
 */
export function SpecTable({ rows }: { rows: SpecRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="w-full text-left">
      <p className="sr-only">Technical specification</p>
      <div className="divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[2fr_3fr] items-baseline py-3.5"
          >
            <div className="label-tech pr-4 font-medium text-muted">
              {row.label}
            </div>
            <div className="text-[0.9375rem] text-ink">
              {row.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

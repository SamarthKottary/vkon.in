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
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">Technical specification</caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-t border-line last:border-b">
            <th
              scope="row"
              className="label-tech w-2/5 py-3.5 pr-4 align-top font-medium text-muted"
            >
              {row.label}
            </th>
            <td className="py-3.5 align-top text-[0.9375rem] text-ink">
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

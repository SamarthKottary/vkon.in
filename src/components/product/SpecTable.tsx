import type { Product, SpecRow } from "@/lib/types";

/**
 * Build spec rows for the product's physical attributes (weight and packed
 * dimensions).  Returns an empty array when nothing is set, so callers can
 * unconditionally spread the result into the rows prop.
 *
 * Weight is shown in kg (one decimal place); dimensions as L × B × H cm.
 */
export function physicalSpecRows(product: Product): SpecRow[] {
  const rows: SpecRow[] = [];

  if (product.weightGrams != null && product.weightGrams > 0) {
    const kg = product.weightGrams / 1000;
    rows.push({
      label: "Weight",
      value: kg % 1 === 0 ? `${kg} kg` : `${kg.toFixed(1)} kg`,
    });
  }

  if (
    product.lengthCm != null &&
    product.breadthCm != null &&
    product.heightCm != null &&
    product.lengthCm > 0 &&
    product.breadthCm > 0 &&
    product.heightCm > 0
  ) {
    rows.push({
      label: "Dimensions",
      value: `${product.lengthCm} × ${product.breadthCm} × ${product.heightCm} cm`,
    });
  }

  return rows;
}

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

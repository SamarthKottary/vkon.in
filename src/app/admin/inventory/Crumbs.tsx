import Link from "next/link";

/**
 * `INVENTORY / WORK` at the top left of a store page (client, 2026-09-26:
 * "instead make it like this inventory/storename").
 *
 * A path rather than a back arrow: the arrow said where the button went, and
 * this says where you are, which is the question somebody three stores deep
 * actually has. Same shape as the site's own breadcrumb — uppercase, muted,
 * slashes between — so the admin reads like the rest of the place.
 */
export function Crumbs({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {trail.map((step, index) => (
          <li key={`${step.label}-${index}`} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden className="text-muted">
                /
              </span>
            )}
            {step.href ? (
              <Link href={step.href} className="label-tech text-muted transition-colors hover:text-accent">
                {step.label}
              </Link>
            ) : (
              <span className="label-tech text-ink">{step.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

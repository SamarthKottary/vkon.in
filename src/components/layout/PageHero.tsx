import Link from "next/link";
import { Container } from "@/components/ui/Container";

/**
 * Masthead for inner pages. Light, ruled, left-aligned — no dark band.
 *
 * `compact` is for pages whose masthead is a label on the way to something
 * else rather than the thing itself. The catalogue is the case it was added
 * for: a full-height masthead pushed the first row of products most of a
 * screen down, so the page opened on prose about products instead of on
 * products. `/protection`, where the masthead *is* the introduction, keeps the
 * roomy one.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  breadcrumb,
  compact = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumb?: { label: string; href: string }[];
  compact?: boolean;
}) {
  return (
    <section className="border-b border-line">
      <Container size="wide">
        <div className={compact ? "py-7 sm:py-9" : "py-12 sm:py-16 lg:py-20"}>
          {breadcrumb && breadcrumb.length > 0 && (
            <nav aria-label="Breadcrumb" className="mb-8">
              <ol className="label-tech flex flex-wrap items-center gap-2 text-muted">
                {breadcrumb.map((crumb, index) => (
                  <li key={crumb.href} className="flex items-center gap-2">
                    {index > 0 && <span aria-hidden>/</span>}
                    <Link href={crumb.href} className="hover:text-ink">
                      {crumb.label}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          {eyebrow && <p className="label-tech text-accent">{eyebrow}</p>}

          <h1
            className={
              compact
                ? "mt-2 max-w-3xl text-[1.75rem] leading-tight sm:text-[2.25rem]"
                : "mt-4 max-w-3xl text-[2.25rem] leading-[1.08] sm:text-5xl lg:text-[3.5rem]"
            }
          >
            {title}
          </h1>

          {description && (
            <p
              className={
                compact
                  ? "mt-2.5 max-w-2xl leading-relaxed text-body"
                  : "mt-6 max-w-2xl text-lg leading-relaxed text-body"
              }
            >
              {description}
            </p>
          )}
        </div>
      </Container>
    </section>
  );
}

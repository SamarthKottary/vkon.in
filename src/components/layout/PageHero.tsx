import Link from "next/link";
import { Container } from "@/components/ui/Container";

/** Masthead for inner pages. Light, ruled, left-aligned — no dark band. */
export function PageHero({
  eyebrow,
  title,
  description,
  breadcrumb,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumb?: { label: string; href: string }[];
}) {
  return (
    <section className="border-b border-line">
      <Container size="wide">
        <div className="py-12 sm:py-16 lg:py-20">
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

          <h1 className="mt-4 max-w-3xl text-[2.25rem] leading-[1.08] sm:text-5xl lg:text-[3.5rem]">
            {title}
          </h1>

          {description && (
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-body">
              {description}
            </p>
          )}
        </div>
      </Container>
    </section>
  );
}

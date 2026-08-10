import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { MobileActionBar } from "@/components/layout/MobileActionBar";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { site } from "@/content/site";
import { telLink } from "@/lib/contact";

/**
 * Root 404. Renders the site chrome itself because it sits outside the
 * `(site)` route group and so does not inherit that layout.
 */
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Container size="wide">
          <div className="max-w-xl py-24 sm:py-32">
            <p className="label-tech text-accent">Error 404</p>
            <h1 className="mt-4 text-[2.25rem] leading-tight sm:text-5xl">
              That page isn&rsquo;t here.
            </h1>
            <p className="mt-6 leading-relaxed text-body">
              The link may be out of date. The full range is on the products
              page, or call us and we will point you straight to what you need.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/products" size="lg">
                Browse products
              </Button>
              <Button href={telLink()} variant="outline" size="lg">
                {site.phone.display}
              </Button>
            </div>
          </div>
        </Container>
      </main>
      <Footer />
      <MobileActionBar />
    </>
  );
}

/**
 * Renders a structured-data block.
 *
 * The payload is always built from our own content files by the helpers in
 * `src/lib/seo.ts` — never from user input — so serialising it into a script
 * tag is safe here.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

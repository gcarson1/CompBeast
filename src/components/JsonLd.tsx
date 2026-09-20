import { serializeJsonLd } from '@/lib/seo';

/**
 * One JSON-LD block. Rendered wherever the content it describes is rendered,
 * so the schema and the visible text come from the same data and cannot
 * disagree — a mismatch between the two is read as a trust signal against
 * the page, not a harmless bug.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
  );
}

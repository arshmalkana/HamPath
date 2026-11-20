/**
 * Schema.org structured data for search engines. A data block (application/ld+json) never runs,
 * so it needs no CSP nonce. "<" is escaped so lesson titles can't close the script element.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

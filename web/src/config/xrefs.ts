/**
 * External cross-reference templates (R3.8): field name → URL template with a
 * `{value}` placeholder. Portal config supplies these per deployment (e.g.
 * mapping an accession field to a registry URL); the generic default is none.
 * This is Level-1 binding config — data, not code (ADR-0003/0004).
 */
export const XREF_TEMPLATES: Record<string, string> = {};

export function xrefUrl(
  field: string,
  value: unknown,
  templates: Record<string, string> = XREF_TEMPLATES,
): string | undefined {
  const template = templates[field];
  if (!template || value == null) return undefined;
  return template.replace('{value}', encodeURIComponent(String(value)));
}

import { normalizeUrl } from "./utils.js";

/**
 * Regex-based HTML link extractor.
 * Pulls URLs from <a href>, <img src>, <link href>, <script src>, <source src>.
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  const rawLinks: string[] = [];

  // <a href="...">
  collectAttribute(html, "a", "href", rawLinks);
  // <img src="...">
  collectAttribute(html, "img", "src", rawLinks);
  // <link href="...">
  collectAttribute(html, "link", "href", rawLinks);
  // <script src="...">
  collectAttribute(html, "script", "src", rawLinks);
  // <source src="...">
  collectAttribute(html, "source", "src", rawLinks);

  // Normalize and deduplicate
  const seen = new Set<string>();
  const results: string[] = [];
  for (const raw of rawLinks) {
    const url = normalizeUrl(raw, baseUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      results.push(url);
    }
  }
  return results;
}

/**
 * Extract all attribute values from a given tag/attribute pair in the HTML.
 * Handles both double-quoted and single-quoted attributes.
 */
function collectAttribute(html: string, tag: string, attr: string, out: string[]): void {
  // Match <tag ... attr="value" ...> and <tag ... attr='value' ...>
  // The tag name must start the opening bracket (with optional whitespace)
  const pattern = new RegExp(
    `<\\s*${tag}\\s[^>]*?\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const value = match[1] ?? match[2];
    if (value) {
      out.push(value);
    }
  }
}

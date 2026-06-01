import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import type { LinkResult, CrawlOptions } from "./utils.js";
import { isSameDomain, normalizeUrl } from "./utils.js";
import { extractLinks } from "./parser.js";
import { checkLinks, type CheckTask } from "./checker.js";

export interface CrawlResult {
  startUrl: string;
  results: LinkResult[];
  pagesCrawled: number;
  totalLinks: number;
}

/**
 * Crawl a website starting from `startUrl` using BFS.
 * For each discovered page, extract links and check them.
 * Only follows internal links (same domain) for crawling.
 * Checks all discovered links (internal + optionally external).
 */
export async function crawl(
  startUrl: string,
  options: CrawlOptions,
  onResult?: (result: LinkResult) => void,
  onPageCrawled?: (url: string, count: number) => void,
): Promise<CrawlResult> {
  // Normalize the start URL
  const normalized = normalizeUrl(startUrl, startUrl);
  if (!normalized) {
    throw new Error(`Invalid start URL: ${startUrl}`);
  }

  // Build exclusion regex if provided
  const excludeRegex = options.excludePattern ? new RegExp(options.excludePattern) : null;

  // BFS state
  const visited = new Set<string>();
  const allResults: LinkResult[] = [];
  const toCheck: CheckTask[] = [];
  const queue: string[] = [normalized];
  let pagesCrawled = 0;

  // Collect all unique URLs to check and pages to crawl
  const pendingLinks = new Map<string, string>(); // url -> sourcePage

  // First, crawl pages to discover all links
  while (queue.length > 0 && pagesCrawled < options.maxPages) {
    const pageUrl = queue.shift()!;
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);
    pagesCrawled++;

    if (!isSameDomain(pageUrl, normalized)) continue;

    // Fetch the page HTML
    const html = await fetchPageHtml(pageUrl, options);
    if (!html) continue;

    // Extract links from the page
    const links = extractLinks(html, pageUrl);

    onPageCrawled?.(pageUrl, links.length);

    for (const link of links) {
      // Skip excluded URLs
      if (excludeRegex && excludeRegex.test(link)) continue;

      // Track the source page for this link
      if (!pendingLinks.has(link)) {
        pendingLinks.set(link, pageUrl);
      }

      // Add internal links to crawl queue
      if (isSameDomain(link, normalized) && !visited.has(link)) {
        queue.push(link);
      }
    }
  }

  // Filter: only check external links if flag is set
  const linksToCheck = Array.from(pendingLinks.entries()).filter(([url]) => {
    if (!options.followExternal && !isSameDomain(url, normalized)) {
      return false;
    }
    return true;
  });

  // Build check tasks
  const tasks: CheckTask[] = linksToCheck.map(([url, sourcePage]) => ({
    url,
    sourcePage,
  }));

  // Check all links concurrently
  const results = await checkLinks(tasks, options, onResult);
  allResults.push(...results);

  return {
    startUrl: normalized,
    results: allResults,
    pagesCrawled,
    totalLinks: allResults.length,
  };
}

/**
 * Fetch the HTML content of a page using Node built-in http/https.
 */
function fetchPageHtml(url: string, options: CrawlOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const requestOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "User-Agent": options.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: options.timeout,
    };

    const req = lib.request(requestOptions, (res) => {
      // Follow redirects for page fetching
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = normalizeUrl(res.headers.location, url);
        if (next) {
          resolve(fetchPageHtml(next, options));
          return;
        }
      }

      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
        res.resume();
        resolve(null);
        return;
      }

      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const html = Buffer.concat(chunks).toString("utf-8");
        resolve(html);
      });
      res.on("error", () => resolve(null));
    });

    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });

    req.on("error", () => {
      resolve(null);
    });

    req.end();
  });
}

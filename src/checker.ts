import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import type { LinkResult, CrawlOptions } from "./utils.js";
import { RateLimiter, getDomain, sleep } from "./utils.js";

const MAX_REDIRECTS = 5;
const SLOW_THRESHOLD_MS = 2000;

export interface CheckTask {
  url: string;
  sourcePage: string;
}

/**
 * Check a batch of links with bounded concurrency.
 * Returns results in the same order as tasks.
 */
export async function checkLinks(
  tasks: CheckTask[],
  options: CrawlOptions,
  onResult?: (result: LinkResult) => void,
): Promise<LinkResult[]> {
  const results: LinkResult[] = new Array(tasks.length);
  const limiter = new RateLimiter(100); // 100ms between same-domain requests

  // Semaphore for bounded concurrency
  let running = 0;
  let nextIndex = 0;
  const waitQueue: Array<() => void> = [];

  function release(): void {
    if (waitQueue.length > 0) {
      const next = waitQueue.shift();
      if (next) next();
    }
  }

  async function acquire(): Promise<void> {
    if (running < options.concurrency) {
      running++;
      return;
    }
    return new Promise<void>((resolve) => {
      waitQueue.push(() => {
        running++;
        resolve();
      });
    });
  }

  const promises = tasks.map(async (task, index) => {
    await acquire();
    try {
      const domain = getDomain(task.url);
      await limiter.wait(domain);
      const result = await checkSingleLink(task.url, task.sourcePage, options);
      results[index] = result;
      onResult?.(result);
    } finally {
      running--;
      release();
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Check a single URL: HEAD first, fallback to GET.
 * Follows redirects up to MAX_REDIRECTS hops.
 */
export async function checkSingleLink(
  url: string,
  sourcePage: string,
  options: CrawlOptions,
): Promise<LinkResult> {
  const start = Date.now();
  const chain: string[] = [url];

  try {
    const { statusCode, finalUrl } = await followRequest(url, options, chain, 0);
    const elapsed = Date.now() - start;

    return {
      url,
      finalUrl,
      statusCode,
      statusCategory: categorize(statusCode),
      sourcePage,
      responseTimeMs: elapsed,
      redirectChain: chain,
      errorMessage: "",
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    // Determine category from error type
    let category: LinkResult["statusCategory"] = "error";
    if (message.includes("ENOTFOUND") || message.includes("getaddrinfo")) {
      category = "dns_error";
    } else if (message.includes("ETIMEDOUT") || message.includes("timeout") || message.includes("ECONNREFUSED")) {
      category = "timeout";
    }

    return {
      url,
      finalUrl: chain[chain.length - 1],
      statusCode: null,
      statusCategory: category,
      sourcePage,
      responseTimeMs: elapsed,
      redirectChain: chain,
      errorMessage: message,
    };
  }
}

/**
 * Follow redirects by re-requesting at the new location.
 */
async function followRequest(
  url: string,
  options: CrawlOptions,
  chain: string[],
  hops: number,
): Promise<{ statusCode: number; finalUrl: string }> {
  if (hops > MAX_REDIRECTS) {
    throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
  }

  const { statusCode, headers, finalUrl } = await makeRequest(url, "HEAD", options);

  const location = headers.location;
  if (location && isRedirect(statusCode)) {
    const next = new URL(location, url).href;
    chain.push(next);
    // Small delay before following redirect
    await sleep(50);
    return followRequest(next, options, chain, hops + 1);
  }

  return { statusCode, finalUrl };
}

/**
 * Make a single HTTP(S) request using Node built-in modules.
 * Falls back from HEAD to GET if HEAD is rejected.
 */
function makeRequest(
  url: string,
  method: "HEAD" | "GET",
  options: CrawlOptions,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const requestOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "User-Agent": options.userAgent,
        Accept: "*/*",
      },
      timeout: options.timeout,
    };

    const req = lib.request(requestOptions, (res) => {
      // Consume/discard the body to free the socket
      res.resume();

      // If HEAD is not allowed (405, 501), retry with GET
      if (method === "HEAD" && (res.statusCode === 405 || res.statusCode === 501)) {
        resolve(makeRequest(url, "GET", options));
        return;
      }

      resolve({
        statusCode: res.statusCode ?? 0,
        headers: res.headers,
        finalUrl: url,
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Request timeout after ${options.timeout}ms`));
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.end();
  });
}

function isRedirect(statusCode: number): boolean {
  return statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308;
}

function categorize(code: number | null): LinkResult["statusCategory"] {
  if (code === null) return "error";
  if (code >= 200 && code <= 299) return "ok";
  if (isRedirect(code)) return "redirect";
  if (code >= 400 && code <= 499) return "client_error";
  if (code >= 500 && code <= 599) return "server_error";
  return "error";
}

/** Re-export slow threshold for reporter */
export { SLOW_THRESHOLD_MS };

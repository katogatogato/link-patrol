import chalk from "chalk";
import { URL } from "node:url";

// ── Types ──────────────────────────────────────────────────────────────────

export interface LinkResult {
  url: string;
  finalUrl: string;
  statusCode: number | null;
  statusCategory: "ok" | "redirect" | "client_error" | "server_error" | "timeout" | "dns_error" | "error";
  sourcePage: string;
  responseTimeMs: number;
  redirectChain: string[];
  errorMessage: string;
}

export interface CrawlOptions {
  concurrency: number;
  timeout: number;
  maxPages: number;
  followExternal: boolean;
  excludePattern: string | undefined;
  userAgent: string;
}

export const DEFAULT_OPTIONS: CrawlOptions = {
  concurrency: 10,
  timeout: 10000,
  maxPages: 100,
  followExternal: false,
  excludePattern: undefined,
  userAgent: "LinkPatrol/1.0 (link-checker)",
};

// ── URL utilities ──────────────────────────────────────────────────────────

export function normalizeUrl(raw: string, base: string): string | null {
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) {
    return null;
  }

  try {
    const resolved = new URL(raw, base);
    // Only keep http/https
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    // Strip fragment
    resolved.hash = "";
    return resolved.href;
  } catch {
    return null;
  }
}

export function isSameDomain(urlA: string, urlB: string): boolean {
  try {
    return new URL(urlA).hostname === new URL(urlB).hostname;
  } catch {
    return false;
  }
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ── Colored output ─────────────────────────────────────────────────────────

export function statusIcon(category: LinkResult["statusCategory"]): string {
  switch (category) {
    case "ok":
      return chalk.green("✓ OK");
    case "redirect":
      return chalk.cyan("↻ REDIR");
    case "client_error":
    case "server_error":
    case "dns_error":
      return chalk.red("✗ FAIL");
    case "timeout":
      return chalk.yellow("⏱ TIMEOUT");
    case "error":
      return chalk.red("✗ ERROR");
  }
}

export function colorStatus(category: LinkResult["statusCategory"], code: number | null): string {
  const codeStr = code !== null ? String(code) : "—";
  switch (category) {
    case "ok":
      return chalk.green(codeStr);
    case "redirect":
      return chalk.cyan(codeStr);
    case "client_error":
    case "server_error":
    case "dns_error":
      return chalk.red(codeStr);
    case "timeout":
      return chalk.yellow(codeStr);
    case "error":
      return chalk.red(codeStr);
  }
}

export function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

// ── Rate limiter ───────────────────────────────────────────────────────────

export class RateLimiter {
  private lastRequest: Map<string, number> = new Map();
  private delayMs: number;

  constructor(delayMs: number) {
    this.delayMs = delayMs;
  }

  async wait(domain: string): Promise<void> {
    const now = Date.now();
    const last = this.lastRequest.get(domain) ?? 0;
    const elapsed = now - last;
    if (elapsed < this.delayMs) {
      await sleep(this.delayMs - elapsed);
    }
    this.lastRequest.set(domain, Date.now());
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

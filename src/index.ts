#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { crawl } from "./crawler.js";
import { checkSingleLink } from "./checker.js";
import { printResults, printSingleResult, writeReports } from "./reporter.js";
import { DEFAULT_OPTIONS } from "./utils.js";
import type { CrawlOptions } from "./utils.js";

const program = new Command();

program
  .name("link-patrol")
  .description("Crawl your site, find broken links, generate reports — CLI and CI ready")
  .version("1.0.0");

// ── check ──────────────────────────────────────────────────────────────────

program
  .command("check")
  .description("Crawl a website and check all links")
  .argument("<url>", "Starting URL to crawl")
  .option("-c, --concurrency <n>", "Max concurrent requests", String(DEFAULT_OPTIONS.concurrency))
  .option("-t, --timeout <ms>", "Request timeout in milliseconds", String(DEFAULT_OPTIONS.timeout))
  .option("-m, --max-pages <n>", "Max pages to crawl", String(DEFAULT_OPTIONS.maxPages))
  .option("--follow-external", "Also check external links", false)
  .option("--exclude <pattern>", "Skip URLs matching regex pattern")
  .option("--user-agent <string>", "Custom User-Agent header", DEFAULT_OPTIONS.userAgent)
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const options = parseOptions(opts);
    console.log(chalk.dim(`  Crawling ${url} (max ${options.maxPages} pages, ${options.concurrency} concurrent)...`));

    try {
      const result = await crawl(url, options, (r) => {
        // Live progress — print each result as it comes
      }, (pageUrl, linkCount) => {
        console.log(chalk.dim(`  Crawled ${pageUrl} — found ${linkCount} links`));
      });

      printResults(result.startUrl, result.results, result.pagesCrawled);

      // Exit with error code if broken links found
      const broken = result.results.filter(
        (r) => r.statusCategory === "client_error" || r.statusCategory === "server_error" || r.statusCategory === "dns_error",
      );
      if (broken.length > 0) {
        process.exit(1);
      }
    } catch (err) {
      console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(2);
    }
  });

// ── report ─────────────────────────────────────────────────────────────────

program
  .command("report")
  .description("Crawl a website, check all links, and generate Markdown/JSON reports")
  .argument("<url>", "Starting URL to crawl")
  .option("-c, --concurrency <n>", "Max concurrent requests", String(DEFAULT_OPTIONS.concurrency))
  .option("-t, --timeout <ms>", "Request timeout in milliseconds", String(DEFAULT_OPTIONS.timeout))
  .option("-m, --max-pages <n>", "Max pages to crawl", String(DEFAULT_OPTIONS.maxPages))
  .option("--follow-external", "Also check external links", false)
  .option("--exclude <pattern>", "Skip URLs matching regex pattern")
  .option("--user-agent <string>", "Custom User-Agent header", DEFAULT_OPTIONS.userAgent)
  .option("-o, --output <dir>", "Output directory for reports", ".")
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const options = parseOptions(opts);
    const outputDir = typeof opts.output === "string" ? opts.output : ".";

    console.log(chalk.dim(`  Crawling ${url} (max ${options.maxPages} pages, ${options.concurrency} concurrent)...`));

    try {
      const result = await crawl(url, options, undefined, (pageUrl, linkCount) => {
        console.log(chalk.dim(`  Crawled ${pageUrl} — found ${linkCount} links`));
      });

      printResults(result.startUrl, result.results, result.pagesCrawled);
      writeReports(result, outputDir);

      const broken = result.results.filter(
        (r) => r.statusCategory === "client_error" || r.statusCategory === "server_error" || r.statusCategory === "dns_error",
      );
      if (broken.length > 0) {
        process.exit(1);
      }
    } catch (err) {
      console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(2);
    }
  });

// ── single ─────────────────────────────────────────────────────────────────

program
  .command("single")
  .description("Check a single URL (no crawling)")
  .argument("<url>", "URL to check")
  .option("-t, --timeout <ms>", "Request timeout in milliseconds", String(DEFAULT_OPTIONS.timeout))
  .option("--user-agent <string>", "Custom User-Agent header", DEFAULT_OPTIONS.userAgent)
  .action(async (url: string, opts: Record<string, string | boolean>) => {
    const timeout = typeof opts.timeout === "string" ? parseInt(opts.timeout, 10) : DEFAULT_OPTIONS.timeout;
    const userAgent = typeof opts.userAgent === "string" ? opts.userAgent : DEFAULT_OPTIONS.userAgent;
    const options: CrawlOptions = { ...DEFAULT_OPTIONS, timeout, userAgent };

    try {
      const result = await checkSingleLink(url, "(direct)", options);
      printSingleResult(result);

      if (result.statusCategory === "client_error" || result.statusCategory === "server_error" || result.statusCategory === "dns_error") {
        process.exit(1);
      }
    } catch (err) {
      console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(2);
    }
  });

program.parse();

// ── Helpers ────────────────────────────────────────────────────────────────

function parseOptions(opts: Record<string, string | boolean>): CrawlOptions {
  return {
    concurrency: typeof opts.concurrency === "string" ? parseInt(opts.concurrency, 10) : DEFAULT_OPTIONS.concurrency,
    timeout: typeof opts.timeout === "string" ? parseInt(opts.timeout, 10) : DEFAULT_OPTIONS.timeout,
    maxPages: typeof opts.maxPages === "string" ? parseInt(opts.maxPages, 10) : DEFAULT_OPTIONS.maxPages,
    followExternal: opts.followExternal === true,
    excludePattern: typeof opts.exclude === "string" ? opts.exclude : undefined,
    userAgent: typeof opts.userAgent === "string" ? opts.userAgent : DEFAULT_OPTIONS.userAgent,
  };
}

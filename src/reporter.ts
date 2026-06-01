import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type { LinkResult } from "./utils.js";
import { statusIcon, colorStatus, formatTime, truncate } from "./utils.js";
import { SLOW_THRESHOLD_MS } from "./checker.js";
import type { CrawlResult } from "./crawler.js";

// ── Terminal table output ──────────────────────────────────────────────────

export function printResults(startUrl: string, results: LinkResult[], pagesCrawled: number): void {
  console.log();
  console.log(chalk.bold(`  Link Patrol — ${startUrl}`));
  console.log(chalk.dim("  ──────────────────────────────────────────────"));
  console.log();

  // Header
  const header = [
    chalk.dim("  Status".padEnd(10)),
    chalk.dim("Code".padEnd(6)),
    chalk.dim("URL".padEnd(45)),
    chalk.dim("Source".padEnd(20)),
    chalk.dim("Time".padEnd(8)),
  ].join("  ");
  console.log(header);
  console.log(chalk.dim("  " + "─".repeat(90)));

  // Sort: errors first, then redirects, then slow, then ok
  const order: Record<LinkResult["statusCategory"], number> = {
    client_error: 0,
    server_error: 1,
    dns_error: 2,
    timeout: 3,
    error: 4,
    redirect: 5,
    ok: 6,
  };

  const sorted = [...results].sort((a, b) => order[a.statusCategory] - order[b.statusCategory]);

  for (const r of sorted) {
    const icon = statusIcon(r.statusCategory).padEnd(16); // colored, so wider
    const code = colorStatus(r.statusCategory, r.statusCode).padEnd(10);

    // URL column: show redirect arrow if redirected
    let urlDisplay = r.url;
    if (r.statusCategory === "redirect" && r.redirectChain.length > 1) {
      urlDisplay = `${r.url} → ${r.finalUrl}`;
    }
    urlDisplay = truncate(urlDisplay, 45);

    const source = truncate(r.sourcePage, 20);
    const time = formatTime(r.responseTimeMs);

    // Highlight slow responses
    const timeDisplay = r.responseTimeMs > SLOW_THRESHOLD_MS
      ? chalk.yellow(time)
      : time;

    console.log(`  ${icon}  ${code}  ${urlDisplay.padEnd(45)}  ${source.padEnd(20)}  ${timeDisplay}`);
  }

  console.log();
  console.log(chalk.dim("  " + "─".repeat(90)));
  console.log(printSummary(results, pagesCrawled));
  console.log();
}

export function printSummary(results: LinkResult[], pagesCrawled: number): string {
  const ok = results.filter((r) => r.statusCategory === "ok").length;
  const broken = results.filter(
    (r) => r.statusCategory === "client_error" || r.statusCategory === "server_error" || r.statusCategory === "dns_error",
  ).length;
  const redirects = results.filter((r) => r.statusCategory === "redirect").length;
  const slow = results.filter((r) => r.responseTimeMs > SLOW_THRESHOLD_MS && r.statusCategory === "ok").length;

  const parts: string[] = [];
  parts.push(`${chalk.green(ok)} OK`);
  if (broken > 0) parts.push(`${chalk.red(broken)} broken`);
  if (redirects > 0) parts.push(`${chalk.cyan(redirects)} redirect${redirects !== 1 ? "s" : ""}`);
  if (slow > 0) parts.push(`${chalk.yellow(slow)} slow`);

  const summary = parts.join(", ");
  return `  Summary: ${summary} — checked ${results.length} links on ${pagesCrawled} pages`;
}

// ── Single URL result (for `single` command) ──────────────────────────────

export function printSingleResult(result: LinkResult): void {
  console.log();
  console.log(chalk.bold("  Link Patrol — Single URL Check"));
  console.log(chalk.dim("  ──────────────────────────────────────────────"));
  console.log();
  console.log(`  URL:            ${result.url}`);
  console.log(`  Status:         ${statusIcon(result.statusCategory)}  ${result.statusCode ?? "—"}`);
  console.log(`  Response time:  ${formatTime(result.responseTimeMs)}`);

  if (result.redirectChain.length > 1) {
    console.log(`  Redirect chain:`);
    for (let i = 0; i < result.redirectChain.length; i++) {
      const prefix = i === result.redirectChain.length - 1 ? "  → " : "  ┆ ";
      console.log(`${prefix}${result.redirectChain[i]}`);
    }
  }

  if (result.errorMessage) {
    console.log(`  Error:          ${chalk.red(result.errorMessage)}`);
  }

  console.log();
}

// ── Markdown report ────────────────────────────────────────────────────────

export function generateMarkdownReport(result: CrawlResult): string {
  const lines: string[] = [];

  lines.push(`# LinkPatrol Report`);
  lines.push("");
  lines.push(`**URL:** ${result.startUrl}`);
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Pages crawled:** ${result.pagesCrawled}`);
  lines.push(`**Links checked:** ${result.totalLinks}`);
  lines.push("");

  // Summary
  const ok = result.results.filter((r) => r.statusCategory === "ok").length;
  const broken = result.results.filter(
    (r) => r.statusCategory === "client_error" || r.statusCategory === "server_error" || r.statusCategory === "dns_error",
  ).length;
  const redirects = result.results.filter((r) => r.statusCategory === "redirect").length;
  const slow = result.results.filter((r) => r.responseTimeMs > SLOW_THRESHOLD_MS).length;

  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total links | ${result.totalLinks} |`);
  lines.push(`| OK | ${ok} |`);
  lines.push(`| Broken | ${broken} |`);
  lines.push(`| Redirects | ${redirects} |`);
  lines.push(`| Slow (>${SLOW_THRESHOLD_MS}ms) | ${slow} |`);
  lines.push(`| Pages crawled | ${result.pagesCrawled} |`);
  lines.push("");

  // Broken links
  const brokenLinks = result.results.filter(
    (r) => r.statusCategory === "client_error" || r.statusCategory === "server_error" || r.statusCategory === "dns_error",
  );
  if (brokenLinks.length > 0) {
    lines.push(`## Broken Links`);
    lines.push("");
    lines.push(`| Source Page | Broken Link | Status | Error |`);
    lines.push(`|-------------|-------------|--------|-------|`);
    for (const link of brokenLinks) {
      const status = link.statusCode ?? "N/A";
      const error = link.errorMessage || statusCategoryLabel(link.statusCategory);
      lines.push(`| ${escapeMd(truncate(link.sourcePage, 60))} | ${escapeMd(truncate(link.url, 80))} | ${status} | ${escapeMd(error)} |`);
    }
    lines.push("");
  }

  // Redirects
  const redirectLinks = result.results.filter((r) => r.statusCategory === "redirect");
  if (redirectLinks.length > 0) {
    lines.push(`## Redirects`);
    lines.push("");
    lines.push(`| Original URL | Final URL | Status |`);
    lines.push(`|-------------|-----------|--------|`);
    for (const link of redirectLinks) {
      lines.push(`| ${escapeMd(truncate(link.url, 70))} | ${escapeMd(truncate(link.finalUrl, 70))} | ${link.statusCode} |`);
    }
    lines.push("");
  }

  // Slow links
  const slowLinks = result.results.filter((r) => r.responseTimeMs > SLOW_THRESHOLD_MS);
  if (slowLinks.length > 0) {
    lines.push(`## Slow Links (>${SLOW_THRESHOLD_MS}ms)`);
    lines.push("");
    lines.push(`| URL | Source | Response Time |`);
    lines.push(`|-----|--------|---------------|`);
    for (const link of slowLinks) {
      lines.push(`| ${escapeMd(truncate(link.url, 70))} | ${escapeMd(truncate(link.sourcePage, 40))} | ${formatTime(link.responseTimeMs)} |`);
    }
    lines.push("");
  }

  // All links
  lines.push(`## All Links`);
  lines.push("");
  lines.push(`| Status | Code | URL | Source | Time |`);
  lines.push(`|--------|------|-----|--------|------|`);
  for (const link of result.results) {
    const status = statusCategoryLabel(link.statusCategory);
    const code = link.statusCode ?? "—";
    lines.push(`| ${status} | ${code} | ${escapeMd(truncate(link.url, 70))} | ${escapeMd(truncate(link.sourcePage, 40))} | ${formatTime(link.responseTimeMs)} |`);
  }
  lines.push("");

  return lines.join("\n");
}

// ── JSON report ────────────────────────────────────────────────────────────

export function generateJsonReport(result: CrawlResult): string {
  const report = {
    startUrl: result.startUrl,
    date: new Date().toISOString(),
    pagesCrawled: result.pagesCrawled,
    totalLinks: result.totalLinks,
    summary: {
      ok: result.results.filter((r) => r.statusCategory === "ok").length,
      broken: result.results.filter(
        (r) => r.statusCategory === "client_error" || r.statusCategory === "server_error" || r.statusCategory === "dns_error",
      ).length,
      redirects: result.results.filter((r) => r.statusCategory === "redirect").length,
      slow: result.results.filter((r) => r.responseTimeMs > SLOW_THRESHOLD_MS).length,
    },
    results: result.results.map((r) => ({
      url: r.url,
      finalUrl: r.finalUrl,
      statusCode: r.statusCode,
      statusCategory: r.statusCategory,
      sourcePage: r.sourcePage,
      responseTimeMs: r.responseTimeMs,
      redirectChain: r.redirectChain,
      errorMessage: r.errorMessage,
    })),
  };
  return JSON.stringify(report, null, 2);
}

// ── File output ────────────────────────────────────────────────────────────

export function writeReports(result: CrawlResult, outputDir: string): void {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const md = generateMarkdownReport(result);
  const json = generateJsonReport(result);

  const mdPath = path.join(outputDir, "link-report.md");
  const jsonPath = path.join(outputDir, "link-report.json");

  fs.writeFileSync(mdPath, md, "utf-8");
  fs.writeFileSync(jsonPath, json, "utf-8");

  console.log(chalk.green(`  ✓ Markdown report: ${mdPath}`));
  console.log(chalk.green(`  ✓ JSON report: ${jsonPath}`));
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statusCategoryLabel(category: LinkResult["statusCategory"]): string {
  switch (category) {
    case "ok": return "OK";
    case "redirect": return "REDIRECT";
    case "client_error": return "CLIENT ERROR";
    case "server_error": return "SERVER ERROR";
    case "timeout": return "TIMEOUT";
    case "dns_error": return "DNS ERROR";
    case "error": return "ERROR";
  }
}

function escapeMd(text: string): string {
  return text.replace(/\|/g, "\\|");
}
